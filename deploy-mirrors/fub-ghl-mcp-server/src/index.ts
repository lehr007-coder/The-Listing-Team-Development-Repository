/**
 * fub-ghl-mcp-server — a real remote MCP server on Cloudflare Workers.
 *
 * Replaces `fub-ghl-mcp-bridge`, which spoke bare JSON-RPC with custom method
 * names and no MCP protocol at all: `initialize` and `tools/list` both returned
 * -32601, so no MCP client could ever connect to it.
 *
 * Transport: Streamable HTTP (stateless JSON). One MCP endpoint at POST /mcp.
 * GET /mcp returns 405 because this server never initiates server-to-client
 * streams.
 */
import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.js";
import { resyncDeals, resyncPeople } from "./resync.js";

interface Env {
  FUB_API_KEY?: string;
  FUB_X_SYSTEM?: string;
  FUB_X_SYSTEM_KEY?: string;
  GHL_PRIVATE_TOKEN?: string;
  GHL_LOCATION_ID?: string;
  MCP_AUTH_TOKEN?: string;
  SUPERPOWERS_INTERNAL_TOKEN?: string;
  SERVER_NAME: string;
  SERVER_VERSION: string;
}

const app = new Hono<{ Bindings: Env }>();

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

app.get("/health", (c) => c.json({ status:"ok", name:c.env.SERVER_NAME, version:c.env.SERVER_VERSION, transport:"streamable-http", endpoint:"/mcp", configured:{ fub_api_key:!!c.env.FUB_API_KEY, fub_x_system:c.env.FUB_X_SYSTEM||"RESF-GHL-App (default)", fub_x_system_key:!!c.env.FUB_X_SYSTEM_KEY, ghl_private_token:!!c.env.GHL_PRIVATE_TOKEN, ghl_location_id:!!c.env.GHL_LOCATION_ID, auth_required:!!c.env.MCP_AUTH_TOKEN } }));

app.use("/mcp", async (c, next) => {
  const origin=c.req.header("Origin");
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return c.json({jsonrpc:"2.0",error:{code:-32600,message:"Origin not allowed"},id:null},403);
  await next(); return undefined;
});

app.use("/mcp", async (c, next) => {
  const expected=c.env.MCP_AUTH_TOKEN;
  if (!expected) return c.json({jsonrpc:"2.0",error:{code:-32000,message:"Server misconfigured: MCP_AUTH_TOKEN is not set."},id:null},500);
  const internal=c.req.header("X-Superpowers-Internal")??"";
  const internalOk=Boolean(c.env.SUPERPOWERS_INTERNAL_TOKEN)&&safeEqual(internal,c.env.SUPERPOWERS_INTERNAL_TOKEN as string);
  const header=c.req.header("Authorization")??"";
  const presented=header.startsWith("Bearer ")?header.slice(7):"";
  const publicOk=Boolean(presented)&&safeEqual(presented,expected);
  if(!internalOk&&!publicOk) return c.json({jsonrpc:"2.0",error:{code:-32001,message:"Unauthorized."},id:null},401,{"WWW-Authenticate":'Bearer realm="mcp"'});
  await next(); return undefined;
});

app.get("/mcp",c=>c.text("Method Not Allowed",405));
app.post("/mcp",async c=>{
  const missing=([["GHL_PRIVATE_TOKEN",c.env.GHL_PRIVATE_TOKEN],["GHL_LOCATION_ID",c.env.GHL_LOCATION_ID]] as const).filter(([,v])=>!v).map(([k])=>k);
  if(missing.length) return c.json({jsonrpc:"2.0",error:{code:-32000,message:`Server misconfigured: ${missing.join(", ")} not set.`},id:null},500);
  const server=new McpServer({name:c.env.SERVER_NAME,version:c.env.SERVER_VERSION},{capabilities:{tools:{}},instructions:"Bridge between Follow Up Boss and GoHighLevel. FUB is read-only. Use dry_run for writes."});
  registerTools(server,{apiKey:c.env.FUB_API_KEY??"",system:c.env.FUB_X_SYSTEM,systemKey:c.env.FUB_X_SYSTEM_KEY},c.env.GHL_PRIVATE_TOKEN as string,c.env.GHL_LOCATION_ID as string);
  const transport=new StreamableHTTPTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  await server.connect(transport); return transport.handleRequest(c);
});
app.all("*",c=>c.json({error:"Not found",hint:"MCP endpoint is POST /mcp. Health check is GET /health."},404));

async function scheduled(event: ScheduledController, env: Env): Promise<void> {
  if(!env.FUB_API_KEY||!env.GHL_PRIVATE_TOKEN||!env.GHL_LOCATION_ID){console.log(JSON.stringify({resync:"skipped",reason:"missing secrets"}));return;}
  try{
    const report=await resyncDeals({apiKey:env.FUB_API_KEY,system:env.FUB_X_SYSTEM??"RESF-GHL-App",systemKey:env.FUB_X_SYSTEM_KEY??""},env.GHL_PRIVATE_TOKEN,env.GHL_LOCATION_ID,{dryRun:false});
    const peopleReport=await resyncPeople({apiKey:env.FUB_API_KEY,system:env.FUB_X_SYSTEM??"RESF-GHL-App",systemKey:env.FUB_X_SYSTEM_KEY??""},env.GHL_PRIVATE_TOKEN,env.GHL_LOCATION_ID,{dryRun:false,windowHours:6});
    console.log(JSON.stringify({resync:"ok",cron:event.cron,seen:report.deals_seen,created:report.created,updated:report.updated,unchanged:report.unchanged,errors:report.errors,people_seen:peopleReport.people_seen,people_synced:peopleReport.synced,people_errors:peopleReport.errors}));
  }catch(error){console.error(JSON.stringify({resync:"failed",error:error instanceof Error?error.message:String(error)}));}
}
export default {fetch:app.fetch,scheduled};
