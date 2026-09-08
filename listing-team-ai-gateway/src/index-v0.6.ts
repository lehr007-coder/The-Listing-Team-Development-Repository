import gatewayV05 from './index-v0.5';

interface EnvV06 {
  SUPERPOWERS_ROUTER_TOKEN?: string;
  CLOUDFLARE_OPS?: Fetcher;
  [key: string]: unknown;
}

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
function bearer(req:Request){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():null;}
function internalAuthorized(req:Request,env:EnvV06){return Boolean(env.SUPERPOWERS_ROUTER_TOKEN)&&bearer(req)===env.SUPERPOWERS_ROUTER_TOKEN;}

const CLOUDFLARE_READ_TOOLS:Record<string,{name:string;arguments?:Record<string,unknown>}> = {
  workers:{name:'cloudflare_list_workers'},
  pages:{name:'cloudflare_list_pages_projects'},
  kv:{name:'cloudflare_list_kv_namespaces'},
  r2:{name:'cloudflare_list_r2_buckets'},
  queues:{name:'cloudflare_list_queues'},
  d1:{name:'cloudflare_list_d1_databases'},
  zones:{name:'cloudflare_list_zones',arguments:{per_page:50}}
};

function parseMcpStructured(payload:any){
  const result=payload?.result??payload;
  if(result?.structuredContent&&typeof result.structuredContent==='object') return result.structuredContent;
  const text=result?.content?.find?.((entry:any)=>entry?.type==='text')?.text;
  if(typeof text==='string'){
    try{return JSON.parse(text);}catch{return {raw:text};}
  }
  return result;
}

async function callCloudflareTool(env:EnvV06,operation:string){
  const tool=CLOUDFLARE_READ_TOOLS[operation];
  if(!tool) return {ok:false,error:'unsupported_read_operation',status:400};
  const upstream=await env.CLOUDFLARE_OPS!.fetch(new Request('https://cloudflare-ops.internal/mcp',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:operation,method:'tools/call',params:{name:tool.name,arguments:tool.arguments||{}}})
  }));
  const text=await upstream.text();
  let payload:any;
  try{payload=text?JSON.parse(text):null;}catch{payload={raw:text};}
  if(!upstream.ok||payload?.error||payload?.result?.isError){
    return {ok:false,status:upstream.status,error:'cloudflare_ops_mcp_upstream_error',message:payload?.error?.message||payload?.result?.content?.[0]?.text||null,tool:tool.name};
  }
  const data=parseMcpStructured(payload);
  return {ok:true,status:upstream.status,tool:tool.name,data};
}

async function cloudflareRead(req:Request,env:EnvV06){
  if(!internalAuthorized(req,env)) return json({ok:false,error:'unauthorized'},401);
  if(!env.CLOUDFLARE_OPS) return json({ok:false,error:'cloudflare_ops_binding_missing'},503);
  let body:Record<string,unknown>={};
  try{body=await req.json() as Record<string,unknown>;}catch{return json({ok:false,error:'invalid_json'},400);}
  const operation=String(body.operation||'summary');
  const allowed=new Set(['summary','workers','pages','kv','r2','queues','d1','zones']);
  if(!allowed.has(operation)) return json({ok:false,error:'unsupported_read_operation'},400);
  if(operation==='summary'){
    const entries=await Promise.all(Object.keys(CLOUDFLARE_READ_TOOLS).map(async (op)=>[op,await callCloudflareTool(env,op)] as const));
    const data:Object=Object.fromEntries(entries.map(([op,res])=>[op,res.ok?{ok:true,operation:op,count:(res.data as any)?.count??null,items:(res.data as any)?.items??null,tool:res.tool}:{ok:false,operation:op,error:res.error,message:res.message||null,tool:res.tool||null}]));
    return json({ok:true,mode:'read_only',capability:'cloudflare_ops',transport:'mcp_worker_service_binding',delete_permitted:false,archive_permitted:false,data});
  }
  const res=await callCloudflareTool(env,operation);
  if(!res.ok) return json({ok:false,error:res.error,status:res.status||null,message:res.message||null,tool:res.tool||null},res.status&&res.status>=400?502:400);
  return json({ok:true,mode:'read_only',capability:'cloudflare_ops',transport:'mcp_worker_service_binding',operation,tool:res.tool,delete_permitted:false,archive_permitted:false,data:res.data});
}

export default {
  async fetch(req:Request,env:EnvV06){
    const u=new URL(req.url);
    if(req.method==='POST'&&u.pathname==='/internal/cloudflare/read') return cloudflareRead(req,env);
    if(req.method==='GET'&&u.pathname==='/internal/cloudflare/health'){
      if(!internalAuthorized(req,env)) return json({ok:false,error:'unauthorized'},401);
      return json({ok:true,gateway_version:'0.6.0',capability:'cloudflare_ops',transport:'mcp_worker_service_binding',mode:'read_only',delete_permitted:false,archive_permitted:false,binding_configured:Boolean(env.CLOUDFLARE_OPS),internal_token_required:false});
    }
    return gatewayV05.fetch(req,env as any);
  }
};
