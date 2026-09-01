const API='https://api.cloudflare.com/client/v4';
const ACCOUNT='0424a0a1799c8b3b7f0947a4e3a202ba';

const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
function auth(req,env){return Boolean(env.CF_OPS_INTERNAL_TOKEN)&&req.headers.get('x-superpowers-internal')===env.CF_OPS_INTERNAL_TOKEN;}
async function cf(path,env){
  if(!env.CF_API_TOKEN) throw new Error('CF_API_TOKEN is not configured');
  const r=await fetch(`${API}${path}`,{headers:{authorization:`Bearer ${env.CF_API_TOKEN}`,'content-type':'application/json'}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d?.success===false) throw new Error(`Cloudflare API ${r.status}`);
  return d?.result;
}
function compact(op,result){
  if(!Array.isArray(result)) return result;
  if(op==='workers') return result.map(x=>({id:x.id,modified_on:x.modified_on||null,created_on:x.created_on||null}));
  if(op==='pages') return result.map(x=>({name:x.name,subdomain:x.subdomain||null,production_branch:x.production_branch||null,created_on:x.created_on||null}));
  if(op==='kv') return result.map(x=>({id:x.id,title:x.title}));
  if(op==='r2') return result.map(x=>({name:x.name,creation_date:x.creation_date||null}));
  if(op==='queues') return result.map(x=>({queue_id:x.queue_id||x.id||null,queue_name:x.queue_name||x.name||null,created_on:x.created_on||null,modified_on:x.modified_on||null}));
  if(op==='d1') return result.map(x=>({uuid:x.uuid||x.id||null,name:x.name||null,created_at:x.created_at||null,version:x.version||null}));
  if(op==='zones') return result.map(x=>({id:x.id,name:x.name,status:x.status||null,paused:Boolean(x.paused)}));
  return result;
}
async function readOne(op,env){
  const paths={
    workers:`/accounts/${ACCOUNT}/workers/scripts`,
    pages:`/accounts/${ACCOUNT}/pages/projects`,
    kv:`/accounts/${ACCOUNT}/storage/kv/namespaces?per_page=100`,
    r2:`/accounts/${ACCOUNT}/r2/buckets`,
    queues:`/accounts/${ACCOUNT}/queues`,
    d1:`/accounts/${ACCOUNT}/d1/database`,
    zones:`/zones?account.id=${ACCOUNT}&per_page=100`
  };
  if(!paths[op]) throw new Error('unsupported_read_operation');
  const result=await cf(paths[op],env);
  return {operation:op,count:Array.isArray(result)?result.length:undefined,items:compact(op,result)};
}
async function summary(env){
  const operations=['workers','pages','kv','r2','queues','d1','zones'];
  const out={};
  for(const op of operations){
    try{const r=await readOne(op,env);out[op]={ok:true,count:r.count};}
    catch(e){out[op]={ok:false,error:String(e?.message||e)};}
  }
  return out;
}
export default {async fetch(req,env){
  const u=new URL(req.url);
  if(req.method==='GET'&&u.pathname==='/health') return json({ok:true,service:'tlt-cloudflare-ops-read',mode:'read_only',writes_supported:false,delete_supported:false,archive_supported:false});
  if(!auth(req,env)) return json({ok:false,error:'unauthorized'},401);
  if(req.method==='POST'&&u.pathname==='/read'){
    let body={};try{body=await req.json();}catch{return json({ok:false,error:'invalid_json'},400);}
    try{
      if(body.operation==='summary') return json({ok:true,mode:'read_only',data:await summary(env)});
      return json({ok:true,mode:'read_only',data:await readOne(String(body.operation||''),env)});
    }catch(e){return json({ok:false,error:String(e?.message||e)},502);}
  }
  return json({ok:false,error:'not_found'},404);
}};
