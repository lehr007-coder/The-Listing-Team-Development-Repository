// GENERATED DEPLOYMENT MIRROR. Canonical source is private marketing-superpowers runtime.
export class ApprovalConsumptionLedger {
  constructor(state){this.state=state;}
  async fetch(request){
    const url=new URL(request.url);
    if(request.method!=='POST'||url.pathname!=='/consume')return Response.json({ok:false,error:'not_found'},{status:404});
    let body;try{body=await request.json();}catch{return Response.json({ok:false,error:'invalid_json'},{status:400});}
    const jti=String(body?.jti||''),fingerprint=String(body?.fingerprint||''),operation=String(body?.operation||''),expiresAt=Number(body?.expires_at||0),now=Math.floor(Date.now()/1000);
    if(!jti||!fingerprint||!operation||!Number.isFinite(expiresAt))return Response.json({ok:false,error:'invalid_consumption_request'},{status:400});
    if(expiresAt<now)return Response.json({ok:false,error:'approval_grant_expired'},{status:409});
    const key=`grant:${jti}`,record={jti,fingerprint,operation,expires_at:expiresAt,consumed_at:now};
    const result=await this.state.storage.transaction(async txn=>{const existing=await txn.get(key);if(existing)return{ok:false,error:'approval_grant_already_consumed',consumed_at:existing.consumed_at,fingerprint:existing.fingerprint,operation:existing.operation};await txn.put(key,record);return{ok:true,consumed:true,jti,fingerprint,operation,consumed_at:now,replay_permitted:false};});
    return Response.json(result,{status:result.ok?200:409});
  }
}
