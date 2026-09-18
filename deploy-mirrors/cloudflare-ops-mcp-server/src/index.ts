import { WorkerEntrypoint } from "cloudflare:workers";
import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";

interface Env {
  CLOUDFLARE_READONLY_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  MCP_AUTH_TOKEN?: string;
  SERVER_NAME: string;
  SERVER_VERSION: string;
}

const app = new Hono<{ Bindings: Env }>();
const READ_ONLY_TOOLS = new Set([
  "cloudflare_list_workers",
  "cloudflare_list_pages_projects",
  "cloudflare_list_kv_namespaces",
  "cloudflare_list_r2_buckets",
  "cloudflare_list_queues",
  "cloudflare_list_d1_databases",
  "cloudflare_list_zones",
  "cloudflare_worker_details",
]);

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function configured(env: Env): env is Env & { CLOUDFLARE_READONLY_API_TOKEN: string; CLOUDFLARE_ACCOUNT_ID: string } {
  return Boolean(env.CLOUDFLARE_READONLY_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID);
}

app.get("/health", (c) => c.json({
  status: "ok",
  name: c.env.SERVER_NAME,
  version: c.env.SERVER_VERSION,
  read_only: true,
  configured: {
    readonly_api_token: Boolean(c.env.CLOUDFLARE_READONLY_API_TOKEN),
    account_id: Boolean(c.env.CLOUDFLARE_ACCOUNT_ID),
    public_auth_required: Boolean(c.env.MCP_AUTH_TOKEN),
  },
  delete_permitted: false,
  archive_permitted: false,
}));

app.use("/mcp", async (c, next) => {
  const expected = c.env.MCP_AUTH_TOKEN;
  if (!expected) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "MCP_AUTH_TOKEN is not configured" } }, 500);
  const header = c.req.header("Authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented || !safeEqual(presented, expected)) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }, 401);
  await next();
  return undefined;
});

app.get("/mcp", (c) => c.text("Method Not Allowed", 405));
app.post("/mcp", async (c) => {
  if (!configured(c.env)) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Cloudflare read-only credentials are not configured" } }, 503);
  const server = new McpServer(
    { name: c.env.SERVER_NAME, version: c.env.SERVER_VERSION },
    { capabilities: { tools: {} }, instructions: "Read-only Cloudflare operational inventory. No mutation tools are registered." }
  );
  registerTools(server, { token: c.env.CLOUDFLARE_READONLY_API_TOKEN, accountId: c.env.CLOUDFLARE_ACCOUNT_ID });
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(c);
});

app.all("*", (c) => c.json({ error: "Not found", hint: "POST /mcp or GET /health" }, 404));

export class SuperpowersReadOnlyEntrypoint extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    if (!configured(this.env)) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Cloudflare read-only credentials are not configured" } }, { status: 503 });
    if (!this.env.MCP_AUTH_TOKEN) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Internal MCP credential is not configured" } }, { status: 503 });
    let body: any;
    try { body = await request.json(); }
    catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } }, { status: 400 }); }
    if (body?.method !== "tools/call") return Response.json({ jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32601, message: "Only tools/call is available on the read-only RPC entrypoint" } }, { status: 400 });
    const name = String(body?.params?.name || "");
    if (!READ_ONLY_TOOLS.has(name)) return Response.json({ jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32601, message: `Tool '${name}' is not available through the read-only RPC entrypoint` } }, { status: 403 });

    return app.fetch(
      new Request("https://cloudflare-ops.internal/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${this.env.MCP_AUTH_TOKEN}` },
        body: JSON.stringify(body),
      }),
      this.env,
      this.ctx
    );
  }
}

export default app;
