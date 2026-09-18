const projects=[
{id:'listinghq',name:'ListingHQ',status:'active',type:'project',repository:'lehr007-coder/listinghq'},
{id:'condo_intel',name:'Condo Intel',status:'production_verified',type:'project',repository:'lehr007-coder/condo-intel-v2'},
{id:'transaction_os',name:'Transaction OS',status:'production_partial_sync_verified',type:'project',repository:'lehr007-coder/the-listing-team-transaction-os',note:'TOS→Condo proven; Condo→TOS outbound proof remains open'},
{id:'marketing_superpowers',name:'Marketing Superpowers',status:'active',type:'control_plane',repository:'lehr007-coder/Listing-Team-Development-Repository'},
{id:'mcp_workers',name:'Canonical MCP Workers',status:'active',type:'shared_infrastructure',repository:'lehr007-coder/mcp-workers'}
];
const capabilities=[
{id:'idx',name:'IDX Safe Execution',status:'verified',mode:'read_only_safe'},
{id:'crm',name:'CRM / FUB-GHL',status:'verified',mode:'read_only_safe'},
{id:'ylopo',name:'Ylopo',status:'verified',mode:'read_only_safe'},
{id:'squarespace',name:'Squarespace',status:'verified',mode:'read_only_safe'},
{id:'github',name:'GitHub Project Health',status:'verified',mode:'read_only'},
{id:'cloudflare_ops',name:'Cloudflare Operations',status:'verified',mode:'read_only'}
];
const json=(d,s=200)=>new Response(JSON.stringify(d,null,2),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
function bearer(req){const h=req.headers.get('authorization')||'';return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():null;}
// Browser SSO is intentionally disabled until Cloudflare Access JWT validation is configured.
// Do not trust identity headers alone on a public workers.dev route.
function auth(req,env){return Boolean(env.DASHBOARD_INTERNAL_TOKEN)&&bearer(req)===env.DASHBOARD_INTERNAL_TOKEN;}
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
async function githubRead(env,tool,args){
 if(!env.AI_GATEWAY||!env.SUPERPOWERS_ROUTER_TOKEN) return {ok:false,error:'gateway_not_configured'};
 const r=await env.AI_GATEWAY.fetch(new Request('https://gateway.internal/internal/github/read',{method:'POST',headers:{authorization:`Bearer ${env.SUPERPOWERS_ROUTER_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({tool,arguments:args})}));
 const data=await r.json();
 if(!r.ok||!data?.ok) return {ok:false,error:data?.error||`gateway_${r.status}`,status:r.status};
 return data;
}
function structured(read){
 const d=read?.data;
 if(d?.structuredContent&&typeof d.structuredContent==='object') return d.structuredContent;
 if(d?.content&&Array.isArray(d.content)){
   const t=d.content.find(x=>x?.type==='text'&&typeof x.text==='string')?.text;
   if(t){try{return JSON.parse(t)}catch{}}
 }
 return null;
}
async function repositoryHealth(env,project){
 const [owner,repo]=project.repository.split('/');
 const base={owner,repo,response_format:'json'};
 const [details,issues,prs,commits]=await Promise.all([
   githubRead(env,'github_get_repository',base),
   githubRead(env,'github_list_issues',{...base,state:'open',limit:100,page:1}),
   githubRead(env,'github_list_pull_requests',{...base,state:'open',limit:100,page:1}),
   githubRead(env,'github_list_commits',{...base,limit:1,page:1})
 ]);
 const rd=structured(details),ri=structured(issues),rp=structured(prs),rc=structured(commits);
 if(!details?.ok||!rd) return {project_id:project.id,name:project.name,repository:project.repository,ok:false,error:details?.error||'repository_read_failed'};
 const issueItems=Array.isArray(ri?.items)?ri.items:[];
 const prItems=Array.isArray(rp?.items)?rp.items:[];
 const commitItems=Array.isArray(rc?.items)?rc.items:[];
 return {
   project_id:project.id,
   name:project.name,
   repository:project.repository,
   ok:true,
   private:Boolean(rd.private),
   archived:Boolean(rd.archived),
   default_branch:rd.default_branch||null,
   language:rd.language||null,
   last_push:rd.last_push||null,
   open_issues:issueItems.filter(x=>!x?.is_pull_request).length,
   open_pull_requests:prItems.length,
   latest_commit:commitItems[0]?{sha:commitItems[0].short_sha||null,message:commitItems[0].message||null,date:commitItems[0].date||null}:null,
   reads:{repository:details.ok===true,issues:issues.ok===true,pull_requests:prs.ok===true,commits:commits.ok===true},
   write_permitted:false,
   delete_permitted:false,
   archive_permitted:false
 };
}
async function githubProjectHealth(env){
 const rows=await Promise.all(projects.map(p=>repositoryHealth(env,p)));
 return {ok:rows.some(x=>x.ok),mode:'read_only',generated_at:new Date().toISOString(),write_permitted:false,delete_permitted:false,archive_permitted:false,repositories:rows};
}
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TLT Operations Dashboard</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0b0d0f;color:#f5f5f5;margin:0}.wrap{max-width:1280px;margin:auto;padding:32px}.head{display:flex;justify-content:space-between;gap:20px;align-items:center}.badge{background:#1b2519;border:1px solid #8cc63e;padding:7px 10px;border-radius:999px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-top:22px}.card{background:#14181c;border:1px solid #2d3339;border-radius:14px;padding:18px}.n{font-size:32px;font-weight:800}.ok{color:#bed62f}.warn{color:#f2c94c}.muted{color:#a7afb7;font-size:13px}.section{margin-top:28px;overflow-x:auto}table{width:100%;border-collapse:collapse;background:#14181c;border-radius:14px;overflow:hidden;min-width:760px}th,td{text-align:left;padding:12px;border-bottom:1px solid #2d3339;vertical-align:top}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}</style></head><body><div class="wrap"><div class="head"><div><h1>TLT Operations Dashboard</h1><div class="muted">Read-only Superpowers control surface</div></div><div class="badge">DELETE / ARCHIVE DISABLED</div></div><div id="app"><p>Loading protected status…</p></div></div><script>function esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}function date(v){return v?new Date(v).toLocaleString():'—'}async function load(){const r=await fetch('/api/status');if(!r.ok){document.getElementById('app').innerHTML='<p>Authentication required.</p>';return}const d=await r.json(),cf=d.cloudflare?.data||{},counts=cf.data||{};const cards=[['Workers',counts.workers?.count],['Pages',counts.pages?.count],['KV',counts.kv?.count],['Queues',counts.queues?.count],['Zones',counts.zones?.count],['D1',counts.d1?.ok?'Available':'Permission-limited']];let h='<div class="grid">'+cards.map(x=>'<div class="card"><div class="muted">'+x[0]+'</div><div class="n '+(x[1]==='Permission-limited'?'warn':'ok')+'">'+(x[1]??'—')+'</div></div>').join('')+'</div>';const repos=d.github?.repositories||[];h+='<div class="section"><h2>Live Project Health</h2><table><tr><th>Project / Repository</th><th>Visibility</th><th>Branch</th><th>Open Issues</th><th>Open PRs</th><th>Last Push</th><th>Latest Commit</th></tr>'+repos.map(x=>'<tr><td><strong>'+esc(x.name)+'</strong><div class="muted mono">'+esc(x.repository)+'</div></td><td class="'+(x.ok?'ok':'warn')+'">'+(x.ok?(x.private?'Private':'Public'):'Read error')+'</td><td>'+esc(x.default_branch||'—')+'</td><td>'+esc(x.open_issues??'—')+'</td><td>'+esc(x.open_pull_requests??'—')+'</td><td class="muted">'+esc(date(x.last_push))+'</td><td><span class="mono">'+esc(x.latest_commit?.sha||'—')+'</span><div class="muted">'+esc(x.latest_commit?.message||'')+'</div></td></tr>').join('')+'</table></div>';h+='<div class="section"><h2>Capabilities</h2><table><tr><th>Capability</th><th>Status</th><th>Mode</th></tr>'+d.capabilities.map(x=>'<tr><td>'+esc(x.name)+'</td><td class="ok">'+esc(x.status)+'</td><td>'+esc(x.mode)+'</td></tr>').join('')+'</table></div>';h+='<div class="section"><h2>Project Registry</h2><table><tr><th>Project</th><th>Status</th><th>Repository</th><th>Note</th></tr>'+d.projects.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.status)+'</td><td class="mono">'+esc(x.repository||'')+'</td><td class="muted">'+esc(x.note||'')+'</td></tr>').join('')+'</table></div>';document.getElementById('app').innerHTML=h}load()</script></body></html>`;
export default {async fetch(req,env){const u=new URL(req.url);if(u.pathname==='/health')return json({ok:true,service:'tlt-operations-dashboard',version:'0.2.0',auth_required:true,auth_mode:'internal_bearer_only',browser_sso:'disabled_until_access_jwt_validation',mode:'read_only',delete_permitted:false,archive_permitted:false});if(!auth(req,env))return json({ok:false,error:'authentication_required'},401);if(u.pathname==='/api/status'){const [cloudflare,gateway,github]=await Promise.allSettled([cfSummary(env),gatewayHealth(env),githubProjectHealth(env)]);return json({ok:true,generated_at:new Date().toISOString(),policy:{read_only:true,delete_permitted:false,archive_permitted:false,writes_exposed:false},projects,capabilities,cloudflare:cloudflare.status==='fulfilled'?{ok:true,data:cloudflare.value}:{ok:false,error:'summary_failed'},gateway:gateway.status==='fulfilled'?gateway.value:{ok:false,error:'health_failed'},github:github.status==='fulfilled'?github.value:{ok:false,error:'github_health_failed'}})}if(u.pathname==='/')return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'}});return json({ok:false,error:'not_found'},404)}};
