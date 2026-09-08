import {currentProviderFailure,providerFailureBlocker} from './providerhealth';

/** Readiness of a mailbox to send. A DNS record is evidence about a domain, never a connection. */
export type Connection='none'|'oauth'|'smtp';
export type Check='none'|'ok'|'failed';
export type ReadinessInput={
 stopped:boolean;connection:Connection;
 /** The four things a working mailbox must prove, in the order they are attempted. */
 auth:Check;testSend:Check;imap:Check;incoming:Check;
 spf:boolean;dkim:boolean;dmarc:boolean;dnsCheckedAt:string|null;
};
export type Readiness={ready:boolean;blockers:string[]};

const stage=(value:Check,required:string,failed:string)=>value==='ok'?null:value==='failed'?failed:required;

/** Every unmet condition is reported, so the operator sees the whole list rather than one at a time. */
export function readiness(input:ReadinessInput):Readiness{
 const blockers:string[]=[];
 if(input.stopped)blockers.push('EMERGENCY_STOP');
 if(input.connection==='none')blockers.push('NOT_CONNECTED');
 else{
  const checks=[
   stage(input.auth,'AUTH_REQUIRED','AUTH_FAILED'),
   stage(input.testSend,'TEST_SEND_REQUIRED','TEST_SEND_FAILED'),
   stage(input.imap,'INCOMING_CHANNEL_REQUIRED','INCOMING_CHANNEL_FAILED'),
   stage(input.incoming,'INCOMING_MESSAGE_REQUIRED','INCOMING_MESSAGE_FAILED')
  ].filter(Boolean) as string[];
  blockers.push(...checks);
 }
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
const checkOf=(value:any):Check=>value?.status==='ok'?'ok':value?.status==='failed'?'failed':'none';
const time=(value:any)=>{const n=Date.parse(String(value??''));return Number.isFinite(n)?n:0;};

/** A proof belongs to the credential/session that produced it. Reconnecting changes connectedAt,
 * so an older success/failure must become pending rather than silently authorising the new token.
 * Mailboxes from very old storage that have no connectedAt keep their legacy proof semantics until
 * they reconnect; once they do, every new connection is protected by this generation boundary. */
export function currentMailboxProof(mailbox:any,field:'auth'|'testSend'|'imap'|'incoming'){
 const proof=mailbox?.[field];
 if(!proof||typeof proof!=='object')return null;
 const connected=time(mailbox?.connectedAt);
 if(!connected)return proof;
 const proved=time(proof?.at);
 return proved>=connected&&proved>0?proof:null;
}

export function mailboxReadiness(domain:any,mailbox:any,stopped=false):Readiness{
 const base=readiness({stopped,connection:mailbox?.connection??'none',
  auth:checkOf(currentMailboxProof(mailbox,'auth')),testSend:checkOf(currentMailboxProof(mailbox,'testSend')),
  imap:checkOf(currentMailboxProof(mailbox,'imap')),incoming:checkOf(currentMailboxProof(mailbox,'incoming')),...dnsOf(domain)});
 const failure=currentProviderFailure(mailbox);
 if(!failure)return base;
 const blocker=providerFailureBlocker(failure);
 return {ready:false,blockers:base.blockers.includes(blocker)?base.blockers:[...base.blockers,blocker]};
}

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
