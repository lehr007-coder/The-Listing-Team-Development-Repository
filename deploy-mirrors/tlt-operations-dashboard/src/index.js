const PROJECTS = [
  ['ListingHQ','ListingHQ'],
  ['Condo Intel','condo-intel-v2'],
  ['Transaction OS','transaction-os'],
  ['Marketing Superpowers','Listing-Team-Development-Repository'],
  ['Canonical MCP Workers','mcp-workers']
];

function json(data,status=200,extra={}) { return new Response(JSON.stringify(data,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra}}); }
function html(body,status=200,extra={}) { return new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store',...extra}}); }
function bearer(req){ const h=req.headers.get('authorization')||''; return h.startsWith('Bearer ')?h.slice(7):null; }
function cookies(req){ return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]})); }
function authed(req,env){ const b=bearer(req); const c=cookies(req).tlt_ops_session; return !!env.DASHBOARD_ACCESS_TOKEN && (b===env.DASHBOARD_ACCESS_TOKEN || c===env.DASHBOARD_ACCESS_TOKEN); }

async function gateway(env,path,opts={}){
  if(!env.AI_GATEWAY||!env.SUPERPOWERS_INTERNAL_TOKEN) return {ok:false,error:'gateway_binding_or_token_missing'};
  try{
    const r=await env.AI_GATEWAY.fetch('https://gateway'+path,{...opts,headers:{authorization:'Bearer '+env.SUPERPOWERS_INTERNAL_TOKEN,'content-type':'application/json',...(opts.headers||{})}});
    const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}}
    return {ok:r.ok,status:r.status,data};
  }catch(e){ return {ok:false,error:'gateway_exception',message:String(e&&e.message||e)}; }
}

async function router(env,path){
  if(!env.SUPERPOWERS_ROUTER||!env.SUPERPOWERS_INTERNAL_TOKEN) return {ok:false,error:'router_binding_or_token_missing'};
  try{ const r=await env.SUPERPOWERS_ROUTER.fetch('https://router'+path,{headers:{authorization:'Bearer '+env.SUPERPOWERS_INTERNAL_TOKEN}}); const text=await r.text(); let data; try{data=JSON.parse(text)}catch{data={raw:text}} return {ok:r.ok,status:r.status,data}; }
  catch(e){ return {ok:false,error:'router_exception',message:String(e&&e.message||e)}; }
}

async function githubRepo(env,repo){
  const res=await gateway(env,'/internal/github/read',{method:'POST',body:JSON.stringify({tool:'github_get_repository',arguments:{owner:'lehr007-coder',repo,response_format:'json'}})});
  if(!res.ok) return {name:repo,ok:false,error:res.error||res.data?.error||('http_'+res.status)};
  const raw=res.data?.data??res.data; const d=raw?.result??raw;
  return {name:repo,ok:true,private:d?.private,default_branch:d?.default_branch,open_issues:d?.open_issues_count,updated_at:d?.updated_at,pushed_at:d?.pushed_at,html_url:d?.html_url};
}

async function snapshot(env){
  const started=Date.now();
  const [cf,reg,...repos]=await Promise.all([
    gateway(env,'/internal/cloudflare/read',{method:'POST',body:JSON.stringify({operation:'summary'})}),
    router(env,'/registry'),
    ...PROJECTS.map(async ([label,repo])=>({label,...await githubRepo(env,repo)}))
  ]);
  const workers=cf.ok?(cf.data?.data?.workers??cf.data?.workers??null):null;
  return {
    ok:true,
    dashboard:'TLT Operations Dashboard',
    version:'2.0.0',
    environment:'production-cloudflare',
    deployment_profile:'pro-production-only',
    generated_at:new Date().toISOString(),
    freshness_ms:Date.now()-started,
    safety:{delete_enabled:false,archive_enabled:false,destructive_controls_visible:false,production_writes_require_approval:true,secret_values_visible:false},
    sources:{cloudflare:{ok:cf.ok,status:cf.status||null,error:cf.error||cf.data?.error||null},router_registry:{ok:reg.ok,status:reg.status||null,error:reg.error||reg.data?.error||null}},
    summary:{projects_total:repos.length,projects_healthy:repos.filter(x=>x.ok).length,cloudflare_workers:workers?.result_info?.total_count??workers?.count??null},
    projects:repos,
    cloudflare:cf.ok?(cf.data?.data??cf.data):{ok:false,error:cf.error||cf.data?.error||'unavailable'},
    registry:reg.ok?reg.data:{ok:false,error:reg.error||reg.data?.error||'unavailable'},
    retirement:{mode:'mark_only',delete_permitted:false,archive_permitted:false}
  };
}

function page(){
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TLT Operations Dashboard</title><style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0b0d0f;color:#fff}.wrap{max-width:1400px;margin:auto;padding:28px}.top{display:flex;justify-content:space-between;align-items:center;gap:20px}.brand{font-size:28px;font-weight:800}.pill{padding:7px 10px;border:1px solid #3d444d;border-radius:999px;color:#bed62f}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:22px 0}.card{background:#15191d;border:1px solid #2a3036;border-radius:14px;padding:16px}.k{font-size:12px;color:#aab2bb;text-transform:uppercase}.v{font-size:27px;font-weight:800;margin-top:7px}.ok{color:#bed62f}.bad{color:#ff8a8a}table{width:100%;border-collapse:collapse;background:#15191d;border:1px solid #2a3036;border-radius:14px;overflow:hidden}th,td{text-align:left;padding:12px;border-bottom:1px solid #2a3036}th{color:#aab2bb;font-size:12px;text-transform:uppercase}.muted{color:#aab2bb}.error{background:#321d1d;border:1px solid #623333;padding:12px;border-radius:10px}</style></head><body><div class="wrap"><div class="top"><div><div class="brand">TLT Operations Dashboard</div><div class="muted">Cloudflare production · ChatGPT + Claude compatible control surface</div></div><div class="pill">PRODUCTION / CLOUDFLARE</div></div><div id="app" class="grid"><div class="card">Loading live system state…</div></div></div><script>async function load(){var app=document.getElementById("app");try{var r=await fetch("/api/snapshot",{credentials:"same-origin"});if(r.status===401){location="/login";return;}var d=await r.json();var healthy=d.summary.projects_healthy===d.summary.projects_total?"ok":"bad";var cards="<div class=\"card\"><div class=\"k\">Projects Healthy</div><div class=\"v "+healthy+"\">"+d.summary.projects_healthy+"/"+d.summary.projects_total+"</div></div>"+"<div class=\"card\"><div class=\"k\">Cloudflare Workers</div><div class=\"v\">"+(d.summary.cloudflare_workers==null?"—":d.summary.cloudflare_workers)+"</div></div>"+"<div class=\"card\"><div class=\"k\">Write Safety</div><div class=\"v ok\">Approval-gated</div></div>"+"<div class=\"card\"><div class=\"k\">Retirement</div><div class=\"v ok\">Mark only</div></div>";var rows=d.projects.map(function(p){return "<tr><td>"+p.label+"</td><td class=\""+(p.ok?"ok":"bad")+"\">"+(p.ok?"HEALTHY":"ERROR")+"</td><td>"+(p.default_branch||"—")+"</td><td>"+(p.open_issues==null?"—":p.open_issues)+"</td><td>"+(p.pushed_at||p.updated_at||"—")+"</td></tr>";}).join("");app.className="";app.innerHTML="<div class=\"grid\">"+cards+"</div><table><thead><tr><th>Project</th><th>Status</th><th>Branch</th><th>Open Issues</th><th>Last Activity</th></tr></thead><tbody>"+rows+"</tbody></table><p class=\"muted\">Freshness: "+d.generated_at+" · "+d.freshness_ms+" ms · Delete/archive disabled.</p>";}catch(e){app.innerHTML="<div class=\"error\">Dashboard refresh failed: "+e.message+"</div>";}}load();setInterval(load,60000);</script></body></html>';
}

function loginPage(error=''){
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TLT Ops Login</title><style>body{font-family:system-ui;background:#0b0d0f;color:#fff;display:grid;place-items:center;height:100vh;margin:0}.box{width:min(420px,90vw);background:#15191d;border:1px solid #2a3036;padding:28px;border-radius:16px}input,button{width:100%;box-sizing:border-box;padding:12px;border-radius:9px;margin-top:12px}button{background:#bed62f;border:0;font-weight:800}.e{color:#ff8a8a}</style></head><body><form class="box" method="post" action="/session"><h2>TLT Operations Dashboard</h2><p>Authorized production access only.</p>'+(error?'<p class="e">'+error+'</p>':'')+'<input type="password" name="token" autocomplete="current-password" placeholder="Access token" required><button>Sign in</button></form></body></html>';
}

export default { async fetch(req,env){
  const u=new URL(req.url);
  if(u.pathname==='/health') return json({ok:true,service:'tlt-operations-dashboard',version:'2.0.0',environment:'production-cloudflare',deployment_profile:'pro-production-only',auth_configured:!!env.DASHBOARD_ACCESS_TOKEN,gateway_binding_configured:!!env.AI_GATEWAY,router_binding_configured:!!env.SUPERPOWERS_ROUTER,delete_enabled:false,archive_enabled:false});
  if(u.pathname==='/login'&&req.method==='GET') return html(loginPage());
  if(u.pathname==='/session'&&req.method==='POST'){
    const form=await req.formData(); const token=String(form.get('token')||'');
    if(!env.DASHBOARD_ACCESS_TOKEN||token!==env.DASHBOARD_ACCESS_TOKEN) return html(loginPage('Invalid access token'),401);
    return new Response(null,{status:303,headers:{location:'/', 'set-cookie':'tlt_ops_session='+encodeURIComponent(token)+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800'}});
  }
  if(!authed(req,env)) return u.pathname.startsWith('/api/')?json({ok:false,error:'unauthorized'},401):new Response(null,{status:302,headers:{location:'/login'}});
  if(u.pathname==='/api/snapshot') return json(await snapshot(env));
  if(u.pathname==='/api/registry') return json(await router(env,'/registry'));
  if(u.pathname==='/') return html(page());
  return json({ok:false,error:'not_found'},404);
}};
