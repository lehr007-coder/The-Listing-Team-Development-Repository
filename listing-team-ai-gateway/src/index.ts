export interface Env {
  GATEWAY_VERSION?: string;
  GATEWAY_AUTH_TOKEN: string;
  IDX_BRIDGE_BASE_URL?: string;
  IDX_BRIDGE_AUTH_TOKEN?: string;
  PROPERTY_DATA_BASE_URL?: string;
  MORTGAGE_BASE_URL?: string;
  RETURNING_CALLER_BASE_URL?: string;
  LEAD_SCORER_BASE_URL?: string;
  CALL_QUALITY_BASE_URL?: string;
  VOICE_BRIDGE_AUTH_TOKEN?: string;
  SUPERPOWERS_ROUTER_BASE_URL?: string;
  SUPERPOWERS_ROUTER_TOKEN?: string;
  SUPERPOWERS_ROUTER?: Fetcher;
}

type Json = Record<string, unknown>;
type ToolDef = { name: string; description: string; inputSchema: Json; route: (args: Json, env: Env) => Promise<unknown>; };

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
function stripSlash(value?: string): string { return (value || "").replace(/\/+$/, ""); }
function requireUrl(value: string | undefined, label: string): string { const url = stripSlash(value); if (!url) throw new Error(`${label} is not configured`); return url; }
function bearer(req: Request): string | null { const header = req.headers.get("authorization") || ""; return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null; }
function authorized(req: Request, env: Env): boolean { if (!env.GATEWAY_AUTH_TOKEN) return false; const token = bearer(req) || req.headers.get("x-gateway-auth"); return token === env.GATEWAY_AUTH_TOKEN; }

async function postJson(url: string, body: Json, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await response.text(); let payload: unknown;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error(`Upstream ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const response = await fetch(url, { headers });
  const text = await response.text(); let payload: unknown;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error(`Upstream ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function idx(tool: string, args: Json, env: Env): Promise<unknown> {
  const base = requireUrl(env.IDX_BRIDGE_BASE_URL, "IDX_BRIDGE_BASE_URL"); const headers: Record<string, string> = {};
  if (env.IDX_BRIDGE_AUTH_TOKEN) headers["x-bridge-auth"] = env.IDX_BRIDGE_AUTH_TOKEN;
  return postJson(`${base}/tool/${encodeURIComponent(tool)}`, args, headers);
}
async function voice(baseUrl: string | undefined, endpoint: string, args: Json, env: Env): Promise<unknown> {
  const base = requireUrl(baseUrl, `${endpoint.toUpperCase()}_BASE_URL`); const headers: Record<string, string> = {};
  if (env.VOICE_BRIDGE_AUTH_TOKEN) headers.authorization = `Bearer ${env.VOICE_BRIDGE_AUTH_TOKEN}`;
  return postJson(`${base}${endpoint}`, args, headers);
}

async function routerFetch(env: Env, path: string, init?: RequestInit): Promise<Response> {
  if (!env.SUPERPOWERS_ROUTER_TOKEN) throw new Error("SUPERPOWERS_ROUTER_TOKEN is not configured");
  const headers = new Headers(init?.headers || {});
  headers.set("authorization", `Bearer ${env.SUPERPOWERS_ROUTER_TOKEN}`);
  if (env.SUPERPOWERS_ROUTER) {
    return env.SUPERPOWERS_ROUTER.fetch(new Request(`https://superpowers.internal${path}`, { ...init, headers }));
  }
  const base = requireUrl(env.SUPERPOWERS_ROUTER_BASE_URL, "SUPERPOWERS_ROUTER_BASE_URL");
  return fetch(`${base}${path}`, { ...init, headers });
}

async function superpowers(args: Json, env: Env): Promise<unknown> {
  const response = await routerFetch(env, "/route", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args)
  });
  const text = await response.text(); let payload: unknown;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  if (!response.ok) throw new Error(`Superpowers router ${response.status}`);
  return payload;
}

type SuperpowersProbe = { ok: boolean; routeAuth: boolean; projectCount?: number; transport?: string; upstreamStatus?: number; reason?: string };
async function superpowersProbe(env: Env): Promise<SuperpowersProbe> {
  if (!env.SUPERPOWERS_ROUTER_TOKEN) return { ok: false, routeAuth: false, reason: "missing_token_binding" };
  try {
    const response = await routerFetch(env, "/registry");
    const transport = env.SUPERPOWERS_ROUTER ? "service_binding" : "workers_dev";
    if (!response.ok) return { ok: false, routeAuth: false, transport, upstreamStatus: response.status, reason: response.status === 401 ? "upstream_unauthorized" : "upstream_non_2xx" };
    const registry = await response.json() as any;
    return { ok: true, routeAuth: true, transport, upstreamStatus: response.status, projectCount: Array.isArray(registry?.projects) ? registry.projects.length : undefined };
  } catch {
    return { ok: false, routeAuth: false, transport: env.SUPERPOWERS_ROUTER ? "service_binding" : "workers_dev", reason: "fetch_error" };
  }
}

const objectSchema = (properties: Json, required: string[] = []) => ({ type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: true });
const tools: ToolDef[] = [
  { name: "superpowers.route", description: "Route a request through TLT Superpowers to the owning project, canonical capabilities, agent plan, and approval gates. This tool plans only; it never deletes or publishes by itself.", inputSchema: objectSchema({ request: { type: "string" }, project_hint: { type: "string" } }, ["request"]), route: (args, env) => superpowers(args, env) },
  { name: "realestate.search_listings", description: "Search active IDX listings using city, ZIP, beds, baths, price and property-type criteria.", inputSchema: objectSchema({ city:{type:"string"}, zipcode:{type:"string"}, beds:{type:"number"}, baths:{type:"number"}, minPrice:{type:"number"}, maxPrice:{type:"number"}, proptype:{type:"string"}, idxStatus:{type:"string",default:"active"} }), route: (args, env) => idx("search_listings", args, env) },
  { name: "realestate.home_valuation", description: "Request an IDX-backed home valuation for a property address.", inputSchema: objectSchema({ address:{type:"string"}, city:{type:"string"}, state:{type:"string"}, zipcode:{type:"string"} }, ["address"]), route: (args, env) => idx("get_home_valuation", args, env) },
  { name: "realestate.suggest_address", description: "Autocomplete or normalize a property address through the IDX service.", inputSchema: objectSchema({ query:{type:"string"} }, ["query"]), route: (args, env) => idx("suggest_address", args, env) },
  { name: "realestate.search_lead", description: "Look up an existing lead through the IDX/Ylopo integration without creating a new lead.", inputSchema: objectSchema({ email:{type:"string"}, phone:{type:"string"}, name:{type:"string"} }), route: (args, env) => idx("search_lead", args, env) },
  { name: "realestate.create_cma_report", description: "Generate a CMA report using the existing IDX MCP capability.", inputSchema: objectSchema({ address:{type:"string"}, city:{type:"string"}, state:{type:"string"}, zipcode:{type:"string"} }, ["address"]), route: (args, env) => idx("create_cma_report", args, env) },
  { name: "realestate.agent_insights", description: "Get agent-oriented IDX insights from the existing MCP integration.", inputSchema: objectSchema({}, []), route: (args, env) => idx("agent_insights", args, env) },
  { name: "property.area_data", description: "Fetch extended property-area data such as schools, walkability and Florida tax estimate when configured.", inputSchema: objectSchema({ address:{type:"string"}, city:{type:"string"}, state:{type:"string"}, zip:{type:"string"}, lat:{type:"number"}, lng:{type:"number"}, home_value:{type:"number"} }, ["address"]), route: (args, env) => voice(env.PROPERTY_DATA_BASE_URL, "/lookup", args, env) },
  { name: "finance.estimate_mortgage", description: "Estimate monthly housing payment using the existing mortgage-estimator Worker.", inputSchema: objectSchema({ price:{type:"number"}, down_payment_pct:{type:"number"}, loan_term_years:{type:"number"} }, ["price"]), route: (args, env) => voice(env.MORTGAGE_BASE_URL, "/estimate", args, env) },
  { name: "voice.returning_caller_context", description: "Retrieve read-only context for a returning GHL caller.", inputSchema: objectSchema({ contact_id:{type:"string"} }, ["contact_id"]), route: (args, env) => voice(env.RETURNING_CALLER_BASE_URL, "/lookup", args, env) },
  { name: "voice.score_lead", description: "Score a Voice AI transcript as HOT, WARM or COLD with reasons and suggested follow-up.", inputSchema: objectSchema({ transcript:{type:"string"}, contact_name:{type:"string"}, contact_phone:{type:"string"}, agent_name:{type:"string"} }, ["transcript"]), route: (args, env) => voice(env.LEAD_SCORER_BASE_URL, "/score", args, env) },
  { name: "voice.review_call_quality", description: "Analyze a Voice AI transcript for call-quality problems and return review flags.", inputSchema: objectSchema({ transcript:{type:"string"}, contact_name:{type:"string"}, contact_phone:{type:"string"}, agent_name:{type:"string"}, recording_url:{type:"string"} }, ["transcript"]), route: (args, env) => voice(env.CALL_QUALITY_BASE_URL, "/flag", args, env) }
];

const byName = new Map(tools.map((tool) => [tool.name, tool]));
async function callTool(name: string, args: Json, env: Env) { const tool = byName.get(name); if (!tool) throw new Error(`Unknown tool: ${name}`); const started = Date.now(); const result = await tool.route(args, env); return { ok:true, tool:name, durationMs:Date.now()-started, data:result }; }
async function handleMcp(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as { jsonrpc?: string; id?: unknown; method?: string; params?: any }; const id=body.id??null;
  try {
    if (body.method === "initialize") return json({ jsonrpc:"2.0", id, result:{ protocolVersion:"2025-03-26", serverInfo:{ name:"listing-team-ai-gateway", version:env.GATEWAY_VERSION||"0.2.0" }, capabilities:{ tools:{} } } });
    if (body.method === "tools/list") return json({ jsonrpc:"2.0", id, result:{ tools:tools.map(({name,description,inputSchema})=>({name,description,inputSchema})) } });
    if (body.method === "tools/call") { const name=body.params?.name as string; const args=(body.params?.arguments||{}) as Json; const result=await callTool(name,args,env); return json({ jsonrpc:"2.0", id, result:{ content:[{type:"text",text:JSON.stringify(result)}], structuredContent:result } }); }
    return json({jsonrpc:"2.0",id,error:{code:-32601,message:"Method not found"}},400);
  } catch (error) { return json({jsonrpc:"2.0",id,error:{code:-32000,message:error instanceof Error?error.message:"Gateway error"}},502); }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url=new URL(req.url);
    if (req.method==="GET"&&url.pathname==="/") return json({name:"listing-team-ai-gateway",version:env.GATEWAY_VERSION||"0.2.0",status:"ok"});
    if (req.method==="GET"&&url.pathname==="/health") return json({ok:true,configured:{superpowers:Boolean((env.SUPERPOWERS_ROUTER||env.SUPERPOWERS_ROUTER_BASE_URL)&&env.SUPERPOWERS_ROUTER_TOKEN),idx:Boolean(env.IDX_BRIDGE_BASE_URL),propertyData:Boolean(env.PROPERTY_DATA_BASE_URL),mortgage:Boolean(env.MORTGAGE_BASE_URL),returningCaller:Boolean(env.RETURNING_CALLER_BASE_URL),leadScorer:Boolean(env.LEAD_SCORER_BASE_URL),callQuality:Boolean(env.CALL_QUALITY_BASE_URL)}});
    if (req.method==="GET"&&url.pathname==="/health/superpowers") return json(await superpowersProbe(env));
    if (!authorized(req,env)) return json({ok:false,error:"Unauthorized"},401);
    if (req.method==="GET"&&url.pathname==="/tools") return json({count:tools.length,tools:tools.map(({name,description,inputSchema})=>({name,description,inputSchema}))});
    if (req.method==="POST"&&url.pathname==="/mcp") return handleMcp(req,env);
    if (req.method==="POST"&&url.pathname.startsWith("/tool/")) { const name=decodeURIComponent(url.pathname.slice("/tool/".length)); try { const args=(await req.json().catch(()=>({}))) as Json; return json(await callTool(name,args,env)); } catch(error) { return json({ok:false,error:error instanceof Error?error.message:"Gateway error"},502); } }
    return json({ok:false,error:"Not found"},404);
  }
};
