import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { accountPath, cfGet, type CloudflareClientConfig } from "./cloudflare.js";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

function result(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function failure(error: unknown) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
  };
}

function normalizeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["buckets", "queues", "databases", "projects", "namespaces", "scripts", "zones"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return [];
}

export function registerTools(server: McpServer, config: CloudflareClientConfig): void {
  const register = (name: string, title: string, description: string, path: string, query: Record<string, string | number | undefined> = {}) => {
    server.registerTool(name, { title, description, inputSchema: {}, annotations: readOnly }, async () => {
      try {
        const data = await cfGet<unknown>(config, path, query);
        const items = normalizeArray(data.result);
        return result({ count: items.length, items });
      } catch (error) { return failure(error); }
    });
  };

  register("cloudflare_list_workers", "List Cloudflare Workers", "Read-only inventory of Worker scripts in the configured Cloudflare account.", accountPath(config.accountId, "/workers/scripts"));
  register("cloudflare_list_pages_projects", "List Cloudflare Pages Projects", "Read-only inventory of Pages projects.", accountPath(config.accountId, "/pages/projects"));
  register("cloudflare_list_kv_namespaces", "List Cloudflare KV Namespaces", "Read-only inventory of Workers KV namespaces.", accountPath(config.accountId, "/storage/kv/namespaces"), { per_page: 100 });
  register("cloudflare_list_r2_buckets", "List Cloudflare R2 Buckets", "Read-only inventory of R2 buckets.", accountPath(config.accountId, "/r2/buckets"));
  register("cloudflare_list_queues", "List Cloudflare Queues", "Read-only inventory of Cloudflare Queues.", accountPath(config.accountId, "/queues"), { per_page: 100 });
  register("cloudflare_list_d1_databases", "List Cloudflare D1 Databases", "Read-only inventory of D1 databases. Availability depends on the scoped token's D1 read permission.", accountPath(config.accountId, "/d1/database"), { per_page: 100 });

  server.registerTool("cloudflare_list_zones", {
    title: "List Cloudflare Zones",
    description: "Read-only inventory of zones attached to the configured account.",
    inputSchema: { per_page: z.number().int().min(1).max(50).default(50) },
    annotations: readOnly,
  }, async ({ per_page }) => {
    try {
      const data = await cfGet<unknown>(config, "/zones", { "account.id": config.accountId, per_page });
      const items = normalizeArray(data.result);
      return result({ count: items.length, items });
    } catch (error) { return failure(error); }
  });

  server.registerTool("cloudflare_worker_details", {
    title: "Get Cloudflare Worker Details",
    description: "Read-only metadata lookup for one Worker script. Does not download source or mutate deployments.",
    inputSchema: { script_name: z.string().min(1) },
    annotations: readOnly,
  }, async ({ script_name }) => {
    try {
      const list = await cfGet<unknown>(config, accountPath(config.accountId, "/workers/scripts"));
      const items = normalizeArray(list.result) as Array<Record<string, unknown>>;
      const item = items.find((entry) => String(entry.id ?? entry.name ?? "") === script_name) ?? null;
      return result({ found: Boolean(item), item });
    } catch (error) { return failure(error); }
  });
}
