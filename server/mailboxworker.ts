import {listAccounts,type Account} from './accounts';
import type {Ctx} from './context';
import {mailboxOperations} from './mailboxes';
import {currentProviderFailure} from './providerhealth';
import {ProviderRequestError} from './providerrequest';
import {change} from './store';
import {applyMailboxProviderFailure} from './mailboxproviderfailure';

export type MailRecoverySummary={accounts:number;mailboxes:number;synced:number;skipped:number;errors:number};

type RecoveryDeps={
 listAccounts:()=>Promise<Account[]>;
 status:(ctx:Ctx)=>Promise<any>;
 sync:(ctx:Ctx,input:{email:string;limit:number})=>Promise<any>;
 recordProviderFailure:(ctx:Ctx,email:string,error:ProviderRequestError)=>Promise<void>;
};

const productionDeps:RecoveryDeps={
 listAccounts,
 status:ctx=>mailboxOperations.status(ctx),
 sync:(ctx,input)=>mailboxOperations.syncReplies(ctx,input),
 recordProviderFailure:async(ctx,email,error)=>{
  await change(ctx.accountId,s=>{applyMailboxProviderFailure(s,email,error);});
 }
};

/** One recovery pass across approved accounts. It deliberately does not require domain sending
 * readiness: receiving replies is useful even if DNS later becomes unhealthy. Disconnected,
 * revoked-token and permanent-error mailboxes are skipped until a person fixes them; temporary
 * provider failures remain eligible so the next pass is the recovery mechanism itself. */
export async function recoverMailboxesOnce(deps:RecoveryDeps=productionDeps):Promise<MailRecoverySummary>{
 const summary:MailRecoverySummary={accounts:0,mailboxes:0,synced:0,skipped:0,errors:0};
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
