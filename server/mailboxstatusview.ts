import {mailboxState} from './mailboxstate';
import {mailboxProviderHealth} from './mailboxhealth';

/**
 * Decorates the existing status payload without removing the proof-based readiness object.
 * This is the API/UI boundary: callers get one product state/action while older clients keep
 * receiving the detailed readiness blockers they already understand.
 */
export async function mailboxStatusView(status:any,accountId?:string){
 const domains=[] as any[];
 for(const domain of status?.domains??[]){
  const mailboxes=[] as any[];
  for(const mailbox of domain?.mailboxes??[]){
   const lastProviderError=accountId?await mailboxProviderHealth(accountId,mailbox.email):null;
   const enriched={...mailbox,lastProviderError:lastProviderError??undefined};
   const view=mailboxState(domain,enriched,Boolean(status?.stopped));
   mailboxes.push({...enriched,state:view.state,action:view.action,ready:view.ready,blockers:view.blockers});
  }
  domains.push({...domain,mailboxes});
 }
 return {...status,domains};
}
