/** Readiness of a mailbox to send. A DNS record is evidence about a domain, never a connection. */
export type Connection='none'|'oauth'|'smtp';
export type TestSend='none'|'ok'|'failed';
export type ReadinessInput={
 stopped:boolean;connection:Connection;testSend:TestSend;
 spf:boolean;dkim:boolean;dmarc:boolean;dnsCheckedAt:string|null;
};
export type Readiness={ready:boolean;blockers:string[]};

/** Every unmet condition is reported, so the operator sees the whole list rather than one at a time. */
export function readiness(input:ReadinessInput):Readiness{
 const blockers:string[]=[];
 if(input.stopped)blockers.push('EMERGENCY_STOP');
 if(input.connection==='none')blockers.push('NOT_CONNECTED');
 else if(input.testSend==='none')blockers.push('TEST_SEND_REQUIRED');
 else if(input.testSend==='failed')blockers.push('TEST_SEND_FAILED');
 if(!input.dnsCheckedAt)blockers.push('DNS_NOT_CHECKED');
 else{
  if(!input.spf)blockers.push('SPF_MISSING');
  if(!input.dkim)blockers.push('DKIM_MISSING');
  if(!input.dmarc)blockers.push('DMARC_MISSING');
 }
 return {ready:blockers.length===0,blockers};
}

const dnsOf=(domain:any)=>({spf:Boolean(domain?.dns?.spf),dkim:Boolean(domain?.dns?.dkim),
 dmarc:Boolean(domain?.dns?.dmarc),dnsCheckedAt:domain?.dns?.checkedAt??null});

export const mailboxReadiness=(domain:any,mailbox:any,stopped=false):Readiness=>
 readiness({stopped,connection:mailbox?.connection??'none',testSend:mailbox?.testSend?.status??'none',...dnsOf(domain)});

/** A domain is ready when at least one of its mailboxes is. */
export function domainReadiness(domain:any,stopped=false):Readiness{
 const boxes=domain?.mailboxes??[];
 if(!boxes.length)return {ready:false,blockers:['NO_MAILBOX']};
 const results=boxes.map((m:any)=>mailboxReadiness(domain,m,stopped));
 const ready=results.find((r:Readiness)=>r.ready);
 if(ready)return ready;
 // Report the mailbox that is closest to being ready.
 return results.reduce((best:Readiness,r:Readiness)=>r.blockers.length<best.blockers.length?r:best,results[0]);
}
