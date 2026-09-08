import {z} from 'zod';
import {read,change} from './store';
import type {Ctx} from './context';
import type {State} from './seed';
import {policy,type Decision} from './policy';
import {domainReadiness,mailboxReadiness} from './readiness';
import {duplicateEmails} from './duplicates';
import {senderCredentials,sendThrough} from './mailboxes';
import {ProviderRequestError} from './providerrequest';
import {normalizeProviderError,type ProviderError} from './providererrors';

/** Real sending.

    Everything else in Sendina decides whether a message may leave. This is the only place one
    actually does, and it is written so that no decision made anywhere else can be skipped here.

    Three properties matter more than throughput:

    1. Nothing is sent that the operator has not already seen. Only an existing prepared draft is
       sent, with the subject and text that draft holds — the same rows `launch_preview` showed.
       Sending never composes anything of its own.

    2. Every rule is re-evaluated for every single message, at the moment that message is about to
       leave, inside the write lock. A decision taken during a preview a minute ago is evidence
       about a minute ago. An emergency stop, a reply that just arrived, an exhausted quota or a
       paused campaign therefore takes effect on the very next message rather than after the run.

    3. The quota is reserved before the network call and handed back if the provider proves the
       send failed. An ambiguous provider outcome keeps the reservation because the message may
       already have left and must not be silently sent again. */

/** Sending is off unless a deployment says otherwise, because turning it on is not reversible for
    the people who receive the mail. The allow list is the controlled-test instrument: while it has
    entries, nothing can leave to anybody else, whatever the campaign says. */
export function sendingConfig(){
 const list=(process.env.SEND_ALLOWLIST??'').split(/[,\s]+/).map(s=>s.trim().toLowerCase()).filter(Boolean);
 const cap=Number(process.env.SEND_MAX_PER_RUN);
 return {
  enabled:process.env.SENDING_ENABLED==='1',
  allowlist:list,
  maxPerRun:Number.isFinite(cap)&&cap>0?Math.min(cap,200):25
 };
}
const onList=(email:string,list:string[])=>!list.length||list.includes(email.toLowerCase());

/** A day's allowance, counted per calendar day in UTC. Without the reset, the first day a domain
    reached its limit would be the last day it ever sent, which is not what a daily limit means. */
export const today=()=>new Date().toISOString().slice(0,10);
export function allowanceOf(domain:any){
 if(domain.usedOn!==today()){domain.used=0;domain.usedOn=today();}
 return {used:Number(domain.used??0),limit:Number(domain.limit??0)};
}

/** The mailbox a message would actually leave through: the first one that has proved all four
    checks and whose domain records are in place. Readiness is not re-implemented here. */
export function senderMailbox(s:State){
 for(const domain of s.domains){
  if(!domainReadiness(domain,s.stopped).ready)continue;
  const mailbox=domain.mailboxes.find((m:any)=>mailboxReadiness(domain,m,s.stopped).ready);
  if(mailbox)return {domain,mailbox};
 }
 return null;
}

export const sendSchema=z.object({
 id:z.string().min(1),
 limit:z.number().int().min(1).max(200).optional(),
 /** Answers "what would happen", touching nothing: the same checks, none of the consequences. */
 dryRun:z.boolean().default(false)
});

type Outcome={contactId:string;messageId:string;email:string;status:'sent'|'blocked'|'failed'|'unknown';
 reason:string;detail:string;at:string};
type Reserved={ok:true;to:string;subject:string;text:string;domainId:string}
 |{ok:false;reason:string;detail:string};
export type SendSettlement={outcome:'sent'|'failed'|'unknown';detail:string;providerError?:ProviderError;
 providerId?:string;providerThreadId?:string;rfcMessageId?:string};

/** Re-decides one message and, if it may go, reserves its place in the quota.

    Returning ok here does not mean anything has been sent. It means this message now holds that
    unit of the day's allowance and is marked as in flight, so the caller owes it a `settle` in
    either direction. Called under the write lock, against the workspace as it is at that instant. */
export function reserve(s:State,campaignId:string,messageId:string,list:string[]):Reserved{
 const stop=(reason:string,detail:string)=>({ok:false as const,reason,detail});
 // The emergency stop is checked first and on its own, so it holds even where everything else
 // about this message is in order, and independently of anything the policy engine may do.
 if(s.stopped)return stop('EMERGENCY_STOP','Аварийная остановка включена.');
 const message=s.messages.find(m=>m.id===messageId);
 if(!message)return stop('MESSAGE_MISSING','Черновик письма не найден.');
 if(message.status==='unknown')return stop('SEND_OUTCOME_UNKNOWN','Результат предыдущей отправки неизвестен. Сначала требуется сверка с почтовым провайдером.');
 if(message.status!=='draft')return stop('ALREADY_SENT',`Письмо уже в состоянии «${message.status}».`);
 const campaign=s.campaigns.find(c=>c.id===campaignId);
 if(!campaign)return stop('CAMPAIGN_MISSING','Кампания не найдена.');
 const contact=s.contacts.find(c=>c.id===message.contactId);
 if(!contact)return stop('RECIPIENT_MISSING','Адресат не найден.');
 if(!contact.email)return stop('NO_ADDRESS','У адресата нет подтверждённого адреса.');

 const sender=senderMailbox(s);
 if(!sender)return stop('SENDER_NOT_READY','Нет ящика, прошедшего все четыре проверки.');
 const allowance=allowanceOf(sender.domain);

 // The same function the preview calls, over the state as it is now rather than as it was shown.
 const decision:Decision=policy({
  stopped:s.stopped,status:campaign.status,
  suppressed:s.suppressed.includes(contact.email),
  replied:s.replies.some(r=>r.email===contact.email&&r.campaignId===campaign.id),
  basis:contact.basis??'',contactReason:contact.reason??'',
  sourceVerified:contact.verification==='verified',
  duplicate:duplicateEmails(s,campaign.id).includes(contact.email),
  control:(campaign.control??'confirm') as 'auto'|'confirm'|'manual',
  firstBatchApproved:Boolean(campaign.firstBatchApprovedAt),
  // The sending domain has just been established as ready by senderMailbox, which is what this
  // flag means; the quota it is paired with is the live one, not a remembered number.
  verified:true,used:allowance.used,limit:allowance.limit
 });
 if(decision.decision!=='allow')return stop(decision.reason,'Правила не пропустили это письмо.');

 // Last, and deliberately after the rules: during a controlled test nothing may reach an address
 // that was not named in advance, however well it satisfies everything else.
 if(!onList(contact.email,list))
  return stop('RECIPIENT_NOT_ALLOWLISTED','Адрес не входит в список разрешённых для контролируемой отправки.');

 sender.domain.used=allowance.used+1;
 sender.domain.usedOn=today();
 message.status='sending';
 message.deliveryState='SENDING';
 message.sentThrough=sender.mailbox.email;
 return {ok:true,to:contact.email,subject:message.subject,text:message.text,domainId:sender.domain.id};
}

const mailboxOf=(s:State,email:string)=>{
 for(const domain of s.domains)for(const mailbox of domain.mailboxes)
  if(mailbox.email===email)return mailbox as any;
 return null;
};

/** Converts a transport exception into the only distinction that matters for idempotency:
    either the provider definitely rejected the send, or acceptance is still possible. */
export function classifySendFailure(e:any):Pick<SendSettlement,'outcome'|'detail'|'providerError'>{
 const providerError=e instanceof ProviderRequestError?e.provider:normalizeProviderError(e);
 const ambiguous=providerError.class==='RETRYABLE'||providerError.class==='UNKNOWN';
 return {outcome:ambiguous?'unknown':'failed',detail:providerError.detail||String(e?.message??e),providerError};
}

/** Records what the network said. A definite failure hands the reserved allowance back. UNKNOWN
    deliberately keeps the reservation and cannot become a draft until reconciliation proves that
    the provider did not accept the message. */
export function settle(s:State,campaignId:string,messageId:string,domainId:string,result:SendSettlement){
 const message=s.messages.find(m=>m.id===messageId);
 if(!message)return;
 const mailbox=mailboxOf(s,String(message.sentThrough??''));
 const at=new Date().toISOString();
 if(result.outcome==='sent'){
  message.status='sent';
  message.deliveryState='SENT';
  message.sentAt=at;
  message.sendDetail=result.detail.slice(0,300);
  message.providerMessageId=result.providerId??'';
  message.providerThreadId=result.providerThreadId??'';
  message.rfcMessageId=result.rfcMessageId??message.rfcMessageId??'';
  if(mailbox)mailbox.lastProviderError=null;
  const campaign=s.campaigns.find(c=>c.id===campaignId);
  if(campaign)campaign.sent=Number(campaign.sent??0)+1;
  return;
 }
 message.sendDetail=result.detail.slice(0,300);
 if(result.providerError&&mailbox)mailbox.lastProviderError={...result.providerError,at};
 if(result.outcome==='unknown'){
  message.status='unknown';
  message.deliveryState='UNKNOWN';
  message.rfcMessageId=result.rfcMessageId??message.rfcMessageId??'';
  return;
 }
 message.status='draft';
 message.deliveryState='FAILED';
 const domain=s.domains.find((d:any)=>d.id===domainId);
 if(domain)domain.used=Math.max(0,Number(domain.used??0)-1);
}

const audit=(s:State,action:string)=>
 s.audit.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),action});

export async function sendCampaign(ctx:Ctx,input:unknown){
 const {id,limit,dryRun}=sendSchema.parse(input);
 const config=sendingConfig();
 // A dry run is allowed on a deployment where sending is off: knowing what would happen is how
 // an operator decides whether to turn it on.
 if(!config.enabled&&!dryRun)
  throw Error('Отправка выключена на этом развёртывании. Её включает администратор переменной окружения SENDING_ENABLED=1.');

 const before=await read(ctx.accountId);
 const campaign=before.campaigns.find(c=>c.id===id);
 if(!campaign)throw Error('Кампания не найдена');
 // Checked before anything else and named for what it is. Readiness already treats a stopped
 // workspace as having no sender, so without this the refusal would come back worded as a
 // mailbox problem — true in its way, and misleading about the actual reason.
 if(before.stopped)throw Error('Аварийная остановка включена: отправка невозможна. Снимите остановку на экране «Настройки».');
 const sender=senderMailbox(before);
 if(!sender)throw Error('Нет ящика, прошедшего все четыре проверки. Подключите ящик, дождитесь успеха всех четырёх проверок и проверьте записи DNS домена.');

 // Only what the operator has already been shown. Sending never writes a letter of its own.
 const queue=before.messages.filter(m=>m.campaignId===id&&m.status==='draft')
  .slice(0,Math.min(limit??config.maxPerRun,config.maxPerRun));
 if(!queue.length)throw Error('Нет подготовленных писем. Сначала подготовьте письма и посмотрите предпросмотр.');

 const outcomes:Outcome[]=[];

 if(dryRun){
  // Decided against a copy, in order, so the quota accumulates exactly as a real run would and
  // the answer says which messages would run out of allowance. Nothing is written anywhere.
  const copy=JSON.parse(JSON.stringify(before)) as State;
  for(const draft of queue){
   const decision=reserve(copy,id,draft.id,config.allowlist);
   outcomes.push({contactId:draft.contactId,messageId:draft.id,email:draft.email,
    status:decision.ok?'sent':'blocked',
    reason:decision.ok?'CHECKS_PASSED':decision.reason,
    detail:decision.ok?'Было бы отправлено.':decision.detail,
    at:new Date().toISOString()});
   if(!decision.ok&&stopsTheRun(decision.reason))break;
  }
 }else{
  const credentials=await senderCredentials(ctx.accountId,sender.mailbox.email);
  if(!credentials)throw Error('Учётные данные ящика не найдены. Подключите ящик заново.');
  for(const draft of queue){
   const at=new Date().toISOString();
   const reserved=await change(ctx.accountId,s=>reserve(s,id,draft.id,config.allowlist));
   if(!reserved.ok){
    outcomes.push({contactId:draft.contactId,messageId:draft.id,email:draft.email,
     status:'blocked',reason:reserved.reason,detail:reserved.detail,at});
    if(stopsTheRun(reserved.reason))break;
    continue;
   }
   let result:SendSettlement;
   try{
    const sent=await sendThrough(credentials,reserved.to,reserved.subject,reserved.text);
    result={outcome:'sent',detail:`Отправлено через ${sent.via}`,
     providerId:sent.id,providerThreadId:sent.threadId,rfcMessageId:sent.messageId};
   }catch(e:any){result=classifySendFailure(e);}
   await change(ctx.accountId,s=>settle(s,id,draft.id,reserved.domainId,result));
   outcomes.push({contactId:draft.contactId,messageId:draft.id,email:draft.email,
    status:result.outcome,reason:result.outcome==='sent'?'SENT':result.outcome==='unknown'?'SEND_UNKNOWN':'SEND_FAILED',
    detail:result.detail,at});
   // Once a provider outcome is ambiguous, do not create any more uncertainty in the same run.
   if(result.outcome==='unknown')break;
  }
 }

 const count=(status:Outcome['status'])=>outcomes.filter(o=>o.status===status).length;
 const sent=count('sent'),blocked=count('blocked'),failed=count('failed'),unknown=count('unknown');
 if(!dryRun)await change(ctx.accountId,s=>{
  audit(s,`Отправка «${campaign.name}» через ${sender.mailbox.email}: отправлено ${sent}, заблокировано правилами ${blocked}, ошибок ${failed}, неизвестный результат ${unknown}.`);
 });

 return {campaignId:id,dryRun,
  sender:{email:sender.mailbox.email,domain:sender.domain.name},
  /** Named back, so a controlled test can see the fence it is running inside. */
  allowlist:config.allowlist.length?config.allowlist:null,
  queued:queue.length,sent,blocked,failed,unknown,results:outcomes};
}

/** A refusal that applies to everything behind it too, so the run ends rather than working
    through the rest of the queue collecting the same answer. */
const stopsTheRun=(reason:string)=>
 ['EMERGENCY_STOP','DOMAIN_LIMIT','CAMPAIGN_PAUSED','SENDER_NOT_READY','SEND_OUTCOME_UNKNOWN',
  'MANUAL_APPROVAL_REQUIRED','FIRST_BATCH_APPROVAL_REQUIRED'].includes(reason);
