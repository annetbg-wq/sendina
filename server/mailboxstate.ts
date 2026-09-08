import {mailboxReadiness} from './readiness';

export type MailboxState='DISCONNECTED'|'CONNECTING'|'READY'|'DEGRADED'|'REAUTH_REQUIRED'|'ERROR';
export type ProviderFailureClass='REAUTH_REQUIRED'|'RATE_LIMITED'|'RETRYABLE'|'PERMANENT'|'UNKNOWN';
export type MailboxStateView={state:MailboxState;ready:boolean;blockers:string[];action:string|null};

const failed=(value:any)=>value?.status==='failed';
const pending=(value:any)=>!value||value.status==='none';
const timestamp=(value:any)=>{const n=Date.parse(String(value?.at??''));return Number.isFinite(n)?n:0;};

/** A provider failure is current until a complete verification happened after it. We require all
 * four proofs to be newer: one successful token refresh alone must not hide an incoming failure. */
function currentProviderFailure(mailbox:any){
 const failure=mailbox?.lastProviderError as undefined|{class?:ProviderFailureClass;code?:string;at?:string};
 if(!failure)return undefined;
 const failureAt=timestamp(failure);
 if(!failureAt)return failure;
 const proofs=[mailbox?.auth,mailbox?.testSend,mailbox?.imap,mailbox?.incoming];
 const recovered=proofs.every(p=>p?.status==='ok'&&timestamp(p)>failureAt);
 return recovered?undefined:failure;
}

/**
 * Product-facing state derived from the existing proof-based readiness model.
 * The old blockers remain authoritative for send policy; this adds one stable state for UI,
 * operations and provider recovery without weakening any existing gate.
 */
export function mailboxState(domain:any,mailbox:any,stopped=false):MailboxStateView{
 const readiness=mailboxReadiness(domain,mailbox,stopped);
 const failure=currentProviderFailure(mailbox);

 if(mailbox?.connection==='none'||!mailbox?.connection)
  return {state:'DISCONNECTED',ready:false,blockers:readiness.blockers,action:'CONNECT'};
 if(failure?.class==='REAUTH_REQUIRED'||(failed(mailbox?.auth)&&mailbox?.auth?.code==='AUTH_REJECTED'))
  return {state:'REAUTH_REQUIRED',ready:false,blockers:readiness.blockers,action:'REAUTHENTICATE'};
 if(failure?.class==='PERMANENT')
  return {state:'ERROR',ready:false,blockers:readiness.blockers,action:'FIX_CONFIGURATION'};
 /** A current provider failure overrides old successful proofs. */
 if(failure?.class==='RATE_LIMITED'||failure?.class==='RETRYABLE'||failure?.class==='UNKNOWN')
  return {state:'DEGRADED',ready:false,blockers:readiness.blockers,action:'RETRY'};
 if(readiness.ready)
  return {state:'READY',ready:true,blockers:[],action:null};
 if(failed(mailbox?.auth)||failed(mailbox?.testSend)||failed(mailbox?.imap)||failed(mailbox?.incoming))
  return {state:'DEGRADED',ready:false,blockers:readiness.blockers,action:'RETRY'};
 if(pending(mailbox?.auth)||pending(mailbox?.testSend)||pending(mailbox?.imap)||pending(mailbox?.incoming))
  return {state:'CONNECTING',ready:false,blockers:readiness.blockers,action:'VERIFY'};
 return {state:'DEGRADED',ready:false,blockers:readiness.blockers,action:'REVIEW_BLOCKERS'};
}
