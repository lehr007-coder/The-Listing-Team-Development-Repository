import gatewayV06 from './index-v0.6';

interface EnvV07 {
  SUPERPOWERS_ROUTER_TOKEN?: string;
  GITHUB_MCP_INTERNAL_TOKEN?: string;
  GITHUB_MCP?: Fetcher;
  [key: string]: unknown;
}

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
function bearer(req:Request){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():null;}
function internalAuthorized(req:Request,env:EnvV07){return Boolean(env.SUPERPOWERS_ROUTER_TOKEN)&&bearer(req)===env.SUPERPOWERS_ROUTER_TOKEN;}

const GITHUB_READ_ONLY_TOOLS=new Set([
  'github_list_my_repositories',
  'github_search_repositories',
  'github_get_repository',
  'github_list_issues',
  'github_list_pull_requests',
  'github_get_file_contents',
  'github_list_commits',
  'github_search_code'
]);

async function githubRead(req:Request,env:EnvV07){
  if(!internalAuthorized(req,env)) return json({ok:false,error:'unauthorized'},401);
  if(!env.GITHUB_MCP) return json({ok:false,error:'github_mcp_binding_missing'},503);
  if(!env.GITHUB_MCP_INTERNAL_TOKEN) return json({ok:false,error:'github_mcp_token_missing'},503);
  let body:Record<string,unknown>={};
  try{body=await req.json() as Record<string,unknown>;}catch{return json({ok:false,error:'invalid_json'},400);}
  const tool=String(body.tool||'').trim();
  const args=(body.arguments&&typeof body.arguments==='object'?body.arguments:{}) as Record<string,unknown>;
  if(!GITHUB_READ_ONLY_TOOLS.has(tool)) return json({ok:false,error:'github_tool_not_approved_for_read_only_gateway',tool},400);
  const upstream=await env.GITHUB_MCP.fetch(new Request('https://github-mcp.internal/mcp',{
    method:'POST',
    headers:{'content-type':'application/json','X-Superpowers-Internal':env.GITHUB_MCP_INTERNAL_TOKEN},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:tool,arguments:args}})
  }));
  const text=await upstream.text();
  let payload:any;
  try{payload=text?JSON.parse(text):null;}catch{payload={raw:text};}
  if(!upstream.ok||payload?.error) return json({ok:false,error:'github_mcp_upstream_error',status:upstream.status,message:payload?.error?.message||null},502);
  return json({ok:true,mode:'read_only',capability:'github',tool,delete_permitted:false,archive_permitted:false,write_permitted:false,data:payload?.result??payload});
}

export default {
  async fetch(req:Request,env:EnvV07){
    const u=new URL(req.url);
    if(req.method==='POST'&&u.pathname==='/internal/github/read') return githubRead(req,env);
    if(req.method==='GET'&&u.pathname==='/internal/github/health'){
      if(!internalAuthorized(req,env)) return json({ok:false,error:'unauthorized'},401);
      return json({ok:true,gateway_version:'0.7.0',capability:'github',transport:'service_binding',mode:'read_only',approved_tool_count:GITHUB_READ_ONLY_TOOLS.size,write_tools_exposed:false,delete_permitted:false,archive_permitted:false,binding_configured:Boolean(env.GITHUB_MCP),token_configured:Boolean(env.GITHUB_MCP_INTERNAL_TOKEN)});
    }
    return gatewayV06.fetch(req,env as any);
  }
};
