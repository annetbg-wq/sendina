import {currentMailboxProof,mailboxReadiness} from './readiness';
import {currentProviderFailure,type ProviderFailureClass} from './providerhealth';
export type {ProviderFailureClass} from './providerhealth';

export type MailboxState='DISCONNECTED'|'CONNECTING'|'READY'|'DEGRADED'|'REAUTH_REQUIRED'|'ERROR';
export type MailboxStateView={state:MailboxState;ready:boolean;blockers:string[];action:string|null};

const failed=(value:any)=>value?.status==='failed';
const pending=(value:any)=>!value||value.status==='none';

/**
 * Product-facing state derived from the proof-based readiness model plus current provider health.
 * The same readiness now gates UI, capabilities and the real send path.
 */
export function mailboxState(domain:any,mailbox:any,stopped=false):MailboxStateView{
 const readiness=mailboxReadiness(domain,mailbox,stopped);
 const failure=currentProviderFailure(mailbox) as undefined|{class?:ProviderFailureClass;code?:string};
 const auth=currentMailboxProof(mailbox,'auth');
 const testSend=currentMailboxProof(mailbox,'testSend');
 const incomingChannel=currentMailboxProof(mailbox,'imap');
 const incoming=currentMailboxProof(mailbox,'incoming');

 if(mailbox?.connection==='none'||!mailbox?.connection)
  return {state:'DISCONNECTED',ready:false,blockers:readiness.blockers,action:'CONNECT'};
 if(failure?.class==='REAUTH_REQUIRED'||(failed(auth)&&auth?.code==='AUTH_REJECTED'))
  return {state:'REAUTH_REQUIRED',ready:false,blockers:readiness.blockers,action:'REAUTHENTICATE'};
 if(failure?.class==='PERMANENT')
  return {state:'ERROR',ready:false,blockers:readiness.blockers,action:'FIX_CONFIGURATION'};
 /** A current provider failure overrides old successful proofs. */
 if(failure?.class==='RATE_LIMITED'||failure?.class==='RETRYABLE'||failure?.class==='UNKNOWN')
  return {state:'DEGRADED',ready:false,blockers:readiness.blockers,action:'RETRY'};
 if(readiness.ready)
  return {state:'READY',ready:true,blockers:[],action:null};
 if(failed(auth)||failed(testSend)||failed(incomingChannel)||failed(incoming))
  return {state:'DEGRADED',ready:false,blockers:readiness.blockers,action:'RETRY'};
 if(pending(auth)||pending(testSend)||pending(incomingChannel)||pending(incoming))
  return {state:'CONNECTING',ready:false,blockers:readiness.blockers,action:'VERIFY'};
 return {state:'DEGRADED',ready:false,blockers:readiness.blockers,action:'REVIEW_BLOCKERS'};
}
