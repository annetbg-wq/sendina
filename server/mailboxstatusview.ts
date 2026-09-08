import {mailboxState} from './mailboxstate';

/**
 * Decorates the existing status payload without removing the proof-based readiness object.
 * This is the API/UI boundary: callers get one product state/action while older clients keep
 * receiving the detailed readiness blockers they already understand.
 */
export function mailboxStatusView(status:any){
 return {...status,domains:(status?.domains??[]).map((domain:any)=>({
  ...domain,
  mailboxes:(domain?.mailboxes??[]).map((mailbox:any)=>{
   const view=mailboxState(domain,mailbox,Boolean(status?.stopped));
   return {...mailbox,state:view.state,action:view.action,ready:view.ready,blockers:view.blockers};
  })
 }))};
}
