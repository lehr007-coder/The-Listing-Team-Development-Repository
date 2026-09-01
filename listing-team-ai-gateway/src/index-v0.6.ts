import gatewayV05 from './index-v0.5';

interface EnvV06 {
  SUPERPOWERS_ROUTER_TOKEN?: string;
  CLOUDFLARE_OPS_INTERNAL_TOKEN?: string;
  CLOUDFLARE_OPS?: Fetcher;
  [key: string]: unknown;
}

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
function bearer(req:Request){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():null;}
function internalAuthorized(req:Request,env:EnvV06){return Boolean(env.SUPERPOWERS_ROUTER_TOKEN)&&bearer(req)===env.SUPERPOWERS_ROUTER_TOKEN;}

async function cloudflareRead(req:Request,env:EnvV06){
  if(!internalAuthorized(req,env)) return json({ok:false,error:'unauthorized'},401);
  if(!env.CLOUDFLARE_OPS) return json({ok:false,error:'cloudflare_ops_binding_missing'},503);
  if(!env.CLOUDFLARE_OPS_INTERNAL_TOKEN) return json({ok:false,error:'cloudflare_ops_token_missing'},503);
  let body:Record<string,unknown>={};
  try{body=await req.json() as Record<string,unknown>;}catch{return json({ok:false,error:'invalid_json'},400);}
  const operation=String(body.operation||'summary');
  const allowed=new Set(['summary','workers','pages','kv','r2','queues','d1','zones']);
  if(!allowed.has(operation)) return json({ok:false,error:'unsupported_read_operation'},400);
  const upstream=await env.CLOUDFLARE_OPS.fetch(new Request('https://cloudflare-ops.internal/read',{
    method:'POST',
    headers:{'content-type':'application/json','x-superpowers-internal':env.CLOUDFLARE_OPS_INTERNAL_TOKEN},
    body:JSON.stringify({operation})
  }));
  const text=await upstream.text();
  return new Response(text,{status:upstream.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}

export default {
  async fetch(req:Request,env:EnvV06){
    const u=new URL(req.url);
    if(req.method==='POST'&&u.pathname==='/internal/cloudflare/read') return cloudflareRead(req,env);
    if(req.method==='GET'&&u.pathname==='/internal/cloudflare/health'){
      if(!internalAuthorized(req,env)) return json({ok:false,error:'unauthorized'},401);
      return json({ok:true,gateway_version:'0.6.0',capability:'cloudflare_ops',transport:'service_binding',mode:'read_only',delete_permitted:false,archive_permitted:false,binding_configured:Boolean(env.CLOUDFLARE_OPS),token_configured:Boolean(env.CLOUDFLARE_OPS_INTERNAL_TOKEN)});
    }
    return gatewayV05.fetch(req,env as any);
  }
};
