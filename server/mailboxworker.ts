import {listAccounts,type Account} from './accounts';
import type {Ctx} from './context';
import {reconcileUnknownDelivery} from './deliveryrecovery';
import {mailboxOperations} from './mailboxes';
import {applyMailboxProviderFailure} from './mailboxproviderfailure';
import {currentProviderFailure} from './providerhealth';
import {ProviderRequestError} from './providerrequest';
import {change,read} from './store';

export type MailRecoverySummary={
 accounts:number;mailboxes:number;synced:number;skipped:number;errors:number;
 unknownChecked:number;unknownResolved:number;
};

type UnknownDelivery={id:string;senderEmail:string};
type RecoveryDeps={
 listAccounts:()=>Promise<Account[]>;
 status:(ctx:Ctx)=>Promise<any>;
 sync:(ctx:Ctx,input:{email:string;limit:number})=>Promise<any>;
 listUnknown:(ctx:Ctx)=>Promise<UnknownDelivery[]>;
 reconcile:(ctx:Ctx,input:{id:string})=>Promise<any>;
 recordProviderFailure:(ctx:Ctx,email:string,error:ProviderRequestError)=>Promise<void>;
};

const productionDeps:RecoveryDeps={
 listAccounts,
 status:ctx=>mailboxOperations.status(ctx),
 sync:(ctx,input)=>mailboxOperations.syncReplies(ctx,input),
 listUnknown:async ctx=>{
  const s=await read(ctx.accountId) as any;
  /** Provider evidence reconciliation is implemented only for Gmail/Graph. A custom SMTP UNKNOWN
   * remains visible for manual investigation rather than being hammered forever by a worker that
   * can never prove it. */
  const oauth=new Map<string,any>();
  for(const domain of s.domains??[])for(const mailbox of domain.mailboxes??[])
   if(mailbox.connection==='oauth'&&['google','microsoft'].includes(mailbox.provider))
    oauth.set(String(mailbox.email).toLowerCase(),mailbox);
  return (s.messages??[]).filter((message:any)=>message.status==='unknown'&&message.deliveryState==='UNKNOWN')
   .map((message:any)=>({id:String(message.id),senderEmail:String(message.sentThrough??'').toLowerCase()}))
   .filter((item:UnknownDelivery)=>{
    const mailbox=oauth.get(item.senderEmail);
    const failure=mailbox?currentProviderFailure(mailbox):undefined;
    return Boolean(mailbox)&&failure?.class!=='REAUTH_REQUIRED'&&failure?.class!=='PERMANENT';
   }).slice(0,50);
 },
 reconcile:(ctx,input)=>reconcileUnknownDelivery(ctx,input),
 recordProviderFailure:async(ctx,email,error)=>{
  await change(ctx.accountId,s=>{applyMailboxProviderFailure(s,email,error);});
 }
};

/** One recovery pass across approved accounts. It deliberately does not require domain sending
 * readiness: receiving replies and reconciling UNKNOWN delivery are useful even if DNS later
 * becomes unhealthy. Disconnected, revoked-token and permanent-error mailboxes are skipped until
 * a person fixes them; temporary provider failures remain eligible so a later pass can recover. */
export async function recoverMailboxesOnce(deps:RecoveryDeps=productionDeps):Promise<MailRecoverySummary>{
 const summary:MailRecoverySummary={accounts:0,mailboxes:0,synced:0,skipped:0,errors:0,unknownChecked:0,unknownResolved:0};
 const accounts=await deps.listAccounts();
 for(const account of accounts){
  if(account.status!=='approved'){summary.skipped++;continue;}
  summary.accounts++;
  const ctx:Ctx={accountId:account.id,email:account.email,role:account.role};
  let status:any;
  try{status=await deps.status(ctx);}catch{summary.errors++;continue;}
  for(const domain of status?.domains??[])for(const mailbox of domain?.mailboxes??[]){
   summary.mailboxes++;
   if(!mailbox?.email||mailbox.connection==='none'||!mailbox.connection){summary.skipped++;continue;}
   const failure=currentProviderFailure(mailbox);
   if(failure?.class==='REAUTH_REQUIRED'||failure?.class==='PERMANENT'){
    summary.skipped++;continue;
   }
   try{
    await deps.sync(ctx,{email:String(mailbox.email).toLowerCase(),limit:100});
    summary.synced++;
   }catch(error:any){
    summary.errors++;
    if(error instanceof ProviderRequestError)
     try{await deps.recordProviderFailure(ctx,String(mailbox.email).toLowerCase(),error);}catch{/* the sync error remains authoritative */}
   }
  }

  let unknown:UnknownDelivery[]=[];
  try{unknown=await deps.listUnknown(ctx);}catch{summary.errors++;}
  for(const item of unknown){
   summary.unknownChecked++;
   try{
    const result=await deps.reconcile(ctx,{id:item.id});
    if(result?.outcome==='sent'||result?.outcome==='already_resolved')summary.unknownResolved++;
   }catch(error:any){
    summary.errors++;
    if(error instanceof ProviderRequestError&&item.senderEmail)
     try{await deps.recordProviderFailure(ctx,item.senderEmail,error);}catch{/* the reconciliation error remains authoritative */}
   }
  }
 }
 return summary;
}

let timer:NodeJS.Timeout|null=null;
let running=false;

/** Periodic recovery is the production fallback even when push/webhook delivery is later added.
 * Five minutes is intentionally conservative; set MAIL_SYNC_INTERVAL_MS=0 to disable it. The
 * worker never overlaps itself and the timer is unref'd so it cannot keep a process alive. */
export function startMailboxRecoveryWorker(){
 if(timer)return timer;
 const configured=Number(process.env.MAIL_SYNC_INTERVAL_MS??300000);
 if(!Number.isFinite(configured)||configured<=0)return null;
 const interval=Math.max(60000,configured);
 timer=setInterval(async()=>{
  if(running)return;
  running=true;
  try{
   const result=await recoverMailboxesOnce();
   console.info(JSON.stringify({event:'mail_recovery_cycle',...result}));
  }catch{
   console.warn(JSON.stringify({event:'mail_recovery_cycle',errors:1}));
  }finally{running=false;}
 },interval);
 timer.unref();
 return timer;
}

/** Exported for deterministic tests and graceful shutdown hooks. */
export function stopMailboxRecoveryWorker(){
 if(timer)clearInterval(timer);
 timer=null;running=false;
}
