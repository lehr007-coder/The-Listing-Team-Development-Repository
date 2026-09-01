const projects=[
{id:'listinghq',name:'ListingHQ',status:'active',type:'project'},
{id:'condo_intel',name:'Condo Intel',status:'production_verified',type:'project'},
{id:'transaction_os',name:'Transaction OS',status:'production_partial_sync_verified',type:'project',note:'TOS→Condo proven; Condo→TOS outbound proof remains open'},
{id:'marketing_superpowers',name:'Marketing Superpowers',status:'active',type:'control_plane'}
];
const capabilities=[
{id:'idx',name:'IDX Safe Execution',status:'verified',mode:'read_only_safe'},
{id:'crm',name:'CRM / FUB-GHL',status:'verified',mode:'read_only_safe'},
{id:'ylopo',name:'Ylopo',status:'verified',mode:'read_only_safe'},
{id:'squarespace',name:'Squarespace',status:'verified',mode:'read_only_safe'},
{id:'cloudflare_ops',name:'Cloudflare Operations',status:'verified',mode:'read_only'}
];
const json=(d,s=200)=>new Response(JSON.stringify(d,null,2),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():null;}
function accessIdentity(req){return req.headers.get('cf-access-authenticated-user-email')||'';}
function auth(req,env){return Boolean(accessIdentity(req))||(Boolean(env.DASHBOARD_INTERNAL_TOKEN)&&bearer(req)===env.DASHBOARD_INTERNAL_TOKEN);}
async function cfSummary(env){
 if(!env.CLOUDFLARE_OPS||!env.CF_OPS_INTERNAL_TOKEN) return {ok:false,error:'cloudflare_ops_not_configured'};
 const r=await env.CLOUDFLARE_OPS.fetch(new Request('https://cloudflare-ops.internal/read',{method:'POST',headers:{'content-type':'application/json','x-superpowers-internal':env.CF_OPS_INTERNAL_TOKEN},body:JSON.stringify({operation:'summary'})}));
 return r.json();
}
async function gatewayHealth(env){
 if(!env.AI_GATEWAY||!env.SUPERPOWERS_ROUTER_TOKEN) return {ok:false,error:'gateway_not_configured'};
 const r=await env.AI_GATEWAY.fetch(new Request('https://gateway.internal/internal/cloudflare/health',{headers:{authorization:`Bearer ${env.SUPERPOWERS_ROUTER_TOKEN}`}}));
 return r.json();
}
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TLT Operations Dashboard</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0b0d0f;color:#f5f5f5;margin:0}.wrap{max-width:1200px;margin:auto;padding:32px}.head{display:flex;justify-content:space-between;gap:20px;align-items:center}.badge{background:#1b2519;border:1px solid #8cc63e;padding:7px 10px;border-radius:999px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-top:22px}.card{background:#14181c;border:1px solid #2d3339;border-radius:14px;padding:18px}.n{font-size:32px;font-weight:800}.ok{color:#bed62f}.warn{color:#f2c94c}.muted{color:#a7afb7;font-size:13px}.section{margin-top:28px}table{width:100%;border-collapse:collapse;background:#14181c;border-radius:14px;overflow:hidden}th,td{text-align:left;padding:12px;border-bottom:1px solid #2d3339}button{background:#bed62f;border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer}</style></head><body><div class="wrap"><div class="head"><div><h1>TLT Operations Dashboard</h1><div class="muted">Read-only Superpowers control surface</div></div><div class="badge">DELETE / ARCHIVE DISABLED</div></div><div id="app"><p>Loading protected status…</p></div></div><script>async function load(){const r=await fetch('/api/status');if(!r.ok){document.getElementById('app').innerHTML='<p>Authentication required.</p>';return}const d=await r.json(),cf=d.cloudflare?.data||{},counts=cf.data||{};const cards=[['Workers',counts.workers?.count],['Pages',counts.pages?.count],['KV',counts.kv?.count],['Queues',counts.queues?.count],['Zones',counts.zones?.count],['D1',counts.d1?.ok?'Available':'Permission-limited']];let h='<div class="grid">'+cards.map(x=>'<div class="card"><div class="muted">'+x[0]+'</div><div class="n '+(x[1]==='Permission-limited'?'warn':'ok')+'">'+(x[1]??'—')+'</div></div>').join('')+'</div>';h+='<div class="section"><h2>Capabilities</h2><table><tr><th>Capability</th><th>Status</th><th>Mode</th></tr>'+d.capabilities.map(x=>'<tr><td>'+x.name+'</td><td class="ok">'+x.status+'</td><td>'+x.mode+'</td></tr>').join('')+'</table></div>';h+='<div class="section"><h2>Projects</h2><table><tr><th>Project</th><th>Status</th><th>Note</th></tr>'+d.projects.map(x=>'<tr><td>'+x.name+'</td><td>'+x.status+'</td><td class="muted">'+(x.note||'')+'</td></tr>').join('')+'</table></div>';document.getElementById('app').innerHTML=h}load()</script></body></html>`;
export default {async fetch(req,env){const u=new URL(req.url);if(u.pathname==='/health')return json({ok:true,service:'tlt-operations-dashboard',auth_required:true,mode:'read_only',delete_permitted:false,archive_permitted:false});if(!auth(req,env))return json({ok:false,error:'authentication_required'},401);if(u.pathname==='/api/status'){const [cloudflare,gateway]=await Promise.allSettled([cfSummary(env),gatewayHealth(env)]);return json({ok:true,generated_at:new Date().toISOString(),policy:{read_only:true,delete_permitted:false,archive_permitted:false,writes_exposed:false},projects,capabilities,cloudflare:cloudflare.status==='fulfilled'?{ok:true,data:cloudflare.value}:{ok:false,error:'summary_failed'},gateway:gateway.status==='fulfilled'?gateway.value:{ok:false,error:'health_failed'}})}if(u.pathname==='/')return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'}});return json({ok:false,error:'not_found'},404)}};
