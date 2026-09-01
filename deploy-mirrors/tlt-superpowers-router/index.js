// GENERATED DEPLOYMENT MIRROR.
// Canonical source: lehr007-coder/Listing-Team-Development-Repository/marketing-superpowers/runtime
// Do not develop independently here.

const projects = [
  { id:'listinghq', name:'ListingHQ', domain:'operations', status:'active', repository:'lehr007-coder/listinghq', writePolicy:'project_gate', keywords:['listinghq','marketplace','listing dashboard'] },
  { id:'condo_intel', name:'Condo Intel', domain:'real_estate_data', status:'production_verified_2026_09_01', repository:'lehr007-coder/condo-intel-v2', writePolicy:'strict_project_gate', keywords:['condo','hoa','association','approval','condo intel'] },
  { id:'transaction_os', name:'Transaction OS', domain:'transactions', status:'production_partial_sync_verified_2026_09_01', repository:'lehr007-coder/the-listing-team-transaction-os', writePolicy:'strict_project_gate', keywords:['transaction','contract','escrow','inspection','closing','deadline','title','commission'] },
  { id:'ylopo_intelligence', name:'Ylopo Intelligence', domain:'lead_intelligence', status:'active_family', repository:'lehr007-coder/ylopo-marketplace', writePolicy:'bounded_write', keywords:['ylopo','lead intent','lead intelligence','lead score'] },
  { id:'marketing_superpowers', name:'Marketing Superpowers', domain:'marketing', status:'active', repository:'lehr007-coder/Listing-Team-Development-Repository', writePolicy:'approval_before_publish', keywords:['marketing','campaign','blog','email','social','seo','landing page','video script'] }
];

const capabilities = [
  { id:'github', domain:'engineering', provider:'mcp_workers_github', keywords:['github','repo','repository','pull request','issue','code'] },
  { id:'crm', domain:'crm', provider:'mcp_workers_fub_ghl', keywords:['crm','ghl','gohighlevel','fub','follow up boss','contact','sms','email','appointment','opportunity'] },
  { id:'ylopo', domain:'lead_intelligence', provider:'mcp_workers_ylopo', keywords:['ylopo','lead activity','lead score'] },
  { id:'squarespace', domain:'website', provider:'mcp_workers_squarespace', keywords:['squarespace','website','blog','page','publish'] },
  { id:'idx', domain:'real_estate_data', provider:'idx_mcp_bridge', keywords:['idx','listing search','valuation','cma','mls'] },
  { id:'seo_edge', domain:'seo', provider:'cloudflare_seo_proxy', keywords:['seo','schema','json-ld','canonical','meta tags','aeo','geo'] },
  { id:'images', domain:'media', provider:'tlt_image_server', keywords:['image','hero','asset','photo'] },
  { id:'social', domain:'social', provider:'social_post_importer_ghl', keywords:['social','instagram','facebook','linkedin','hashtags','schedule'] },
  { id:'voice_ai', domain:'voice_ai', provider:'voice_ai_suite', keywords:['voice','caller','call score','mortgage estimate','daily brief'] }
];

const policies = {
  neverDeleteAutomatically:true,
  neverArchiveAutomatically:true,
  projectBeforeCapability:true,
  preferCanonicalExistingSystems:true,
  humanApprovalBeforePublication:true,
  humanApprovalBeforeDestructiveAction:true,
  strictWriteProjects:['condo_intel','transaction_os']
};

const normalize = (v) => String(v || '').trim().toLowerCase();
function scoreKeywords(text, keywords=[]) { let score=0; const matched=[]; for (const keyword of keywords) { const k=keyword.toLowerCase(); if (text.includes(k)) { score += k.includes(' ') ? 3 : 1; matched.push(keyword); } } return {score,matched}; }
function resolveProject(text,hint) {
  if (hint) { const explicit=projects.find(p=>p.id===hint || p.name.toLowerCase()===String(hint).toLowerCase()); if (explicit) return {project:explicit,confidence:1,matched:['explicit_project_hint']}; }
  const ranked=projects.map(project=>({project,...scoreKeywords(text,project.keywords)})).sort((a,b)=>b.score-a.score);
  const best=ranked[0]; if (!best || best.score===0) return {project:null,confidence:0,matched:[]};
  const second=ranked[1]?.score||0; return {project:best.project,confidence:Math.min(.98,.55+best.score*.08+Math.max(0,best.score-second)*.04),matched:best.matched};
}
function resolveCapabilities(text, project) {
  const selected=capabilities.map(capability=>({capability,...scoreKeywords(text,capability.keywords)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>({id:x.capability.id,provider:x.capability.provider,domain:x.capability.domain,matched:x.matched}));
  if (project?.id==='marketing_superpowers') for (const id of ['squarespace','seo_edge','images']) if (!selected.some(x=>x.id===id)) { const c=capabilities.find(x=>x.id===id); selected.push({id:c.id,provider:c.provider,domain:c.domain,matched:['project_default']}); }
  if (project?.id==='condo_intel' && !selected.some(x=>x.id==='crm')) { const c=capabilities.find(x=>x.id==='crm'); selected.push({id:c.id,provider:c.provider,domain:c.domain,matched:['project_dependency']}); }
  return selected;
}
function inferIntent(text) {
  const destructive=['delete','remove','destroy','archive','disable','drop','purge'].some(w=>text.includes(w));
  const publish=['publish','send','schedule','post','launch','deploy'].some(w=>text.includes(w));
  const write=destructive||publish||['create','update','change','edit','write','add','sync','push'].some(w=>text.includes(w));
  return {destructive,publish,write,readOnly:!write};
}
function agentPlan(project,text) {
  if (!project) return ['orchestrator'];
  if (project.id==='marketing_superpowers') { const p=['orchestrator','researcher','strategist','writer']; if (['seo','blog','website','landing page'].some(w=>text.includes(w))) p.push('seo_aeo'); p.push('fact_compliance','editor','publisher'); return p; }
  if (project.id==='condo_intel') return ['orchestrator','real_estate_data','fact_compliance'];
  if (project.id==='transaction_os') return ['orchestrator','transaction_intelligence','fact_compliance'];
  if (project.id==='ylopo_intelligence') return ['orchestrator','lead_intelligence','fact_compliance'];
  return ['orchestrator'];
}
function routeRequest(input) {
  const request=normalize(input?.request); if (!request) return {ok:false,error:'request_required'};
  const pr=resolveProject(request,input?.project_hint); const project=pr.project; const selected=resolveCapabilities(request,project); const intent=inferIntent(request); const gates=[];
  if (intent.destructive) gates.push('BLOCKED_BY_DEFAULT_NO_DELETE_POLICY');
  if (intent.publish) gates.push('HUMAN_APPROVAL_BEFORE_PUBLICATION');
  if (intent.write && project && policies.strictWriteProjects.includes(project.id)) gates.push('STRICT_PROJECT_WRITE_GATE');
  if (intent.write && !intent.publish && !intent.destructive) gates.push('WRITE_APPROVAL_REQUIRED');
  const safe=intent.readOnly&&gates.length===0;
  return {ok:true,request:input.request,intent,project:project?{id:project.id,name:project.name,domain:project.domain,status:project.status,repository:project.repository,write_policy:project.writePolicy,confidence:Number(pr.confidence.toFixed(2)),matched:pr.matched}:null,capabilities:selected,agents:agentPlan(project,request),gates,execution:{mode:safe?'read_only_safe':'plan_or_wait_for_approval',can_execute_without_approval:safe,delete_permitted:false,archive_permitted:false},recommendation:project?`Route through ${project.name} first, then use canonical capabilities.`:'No owning project resolved. Use the orchestrator to clarify or perform capability-only routing.'};
}
function json(body,status=200){ return new Response(JSON.stringify(body,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}}); }
function bearer(request){ const h=request.headers.get('authorization')||''; return h.toLowerCase().startsWith('bearer ')?h.slice(7).trim():null; }
function authorized(request,env){ return Boolean(env?.SUPERPOWERS_AUTH_TOKEN) && bearer(request)===env.SUPERPOWERS_AUTH_TOKEN; }

export default { async fetch(request,env) {
  const url=new URL(request.url);
  if (request.method==='GET'&&url.pathname==='/health') return json({ok:true,service:'tlt-superpowers-router',version:'0.2.0',mode:'deterministic-routing',canonical_source:'lehr007-coder/Listing-Team-Development-Repository/marketing-superpowers/runtime',auth:{protected_endpoints:['/registry','/route']},policy:{never_delete_automatically:true,never_archive_automatically:true,project_before_capability:true,human_approval_before_publication:true}});
  if ((url.pathname==='/registry'||url.pathname==='/route')&&!authorized(request,env)) return json({ok:false,error:'unauthorized'},401);
  if (request.method==='GET'&&url.pathname==='/registry') return json({projects:projects.map(({keywords,...p})=>p),capabilities:capabilities.map(({keywords,...c})=>c),policies});
  if (request.method==='POST'&&url.pathname==='/route') { let body; try { body=await request.json(); } catch { return json({ok:false,error:'invalid_json'},400); } const r=routeRequest(body); return json(r,r.ok?200:400); }
  return json({ok:false,error:'not_found',endpoints:['GET /health','GET /registry [auth]','POST /route [auth]']},404);
}};
