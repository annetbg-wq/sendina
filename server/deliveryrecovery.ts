import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {read,change} from './store';
import type {Ctx} from './context';
import type {State} from './seed';
import {senderCredentials} from './mailboxes';
import {oauthAccessToken} from './oauthaccess';
import {reconcileGmailSent,reconcileMicrosoftSent,type SentIdentity} from './sentreconcile';

export const deliveryRecoverySchema=z.object({id:z.string().min(1)});
export type DeliveryRecoveryOutcome='sent'|'pending'|'unsupported'|'already_resolved';

const sameMessageId=(a:string,b:string)=>a.trim().toLowerCase()===b.trim().toLowerCase();
const audit=(s:State,action:string)=>s.audit.unshift({id:randomUUID(),at:new Date().toISOString(),action});

/** Applies provider delivery evidence exactly once. It deliberately does not touch domain.used:
 * UNKNOWN already kept the conservative quota reservation, and SENT should keep it spent. */
export function applyDeliveryEvidence(s:State,id:string,evidence:SentIdentity){
 const message=s.messages.find((m:any)=>m.id===id) as any;
 if(!message)throw Error('Письмо не найдено.');
 if(message.status==='sent'||message.deliveryState==='SENT')
  return {outcome:'already_resolved' as const,messageId:id,deliveryState:'SENT' as const};
 if(message.status!=='unknown'||message.deliveryState!=='UNKNOWN')
  throw Error('Сверка разрешена только для отправки в состоянии UNKNOWN.');
 const expected=String(message.rfcMessageId??'');
 if(!expected)throw Error('У UNKNOWN-отправки нет RFC Message-ID для безопасной сверки.');
 if(evidence.messageId&&!sameMessageId(expected,evidence.messageId))
  throw Error('Провайдер вернул другое RFC Message-ID; результат не применяется.');

 message.status='sent';
 message.deliveryState='SENT';
 message.sentAt=evidence.sentAt||new Date().toISOString();
 message.providerMessageId=evidence.providerId;
 message.providerThreadId=evidence.threadId;
 message.rfcMessageId=evidence.messageId||expected;
 message.sendDetail='Отправка подтверждена сверкой с почтовым провайдером после UNKNOWN.';
 const campaign=s.campaigns.find((c:any)=>c.id===message.campaignId);
 if(campaign)campaign.sent=Number(campaign.sent??0)+1;
 audit(s,`UNKNOWN-отправка ${id} подтверждена у провайдера и переведена в SENT.`);
 return {outcome:'sent' as const,messageId:id,deliveryState:'SENT' as const,
  providerMessageId:evidence.providerId,providerThreadId:evidence.threadId,rfcMessageId:message.rfcMessageId,
  sentAt:message.sentAt};
}

/** Reads provider evidence without ever resending the message. A miss means "not proven yet",
 * not "failed": the message remains UNKNOWN and its quota reservation remains intact. */
export async function reconcileUnknownDelivery(ctx:Ctx,input:unknown){
 const {id}=deliveryRecoverySchema.parse(input);
 const before=await read(ctx.accountId);
 const message=before.messages.find((m:any)=>m.id===id) as any;
 if(!message)throw Error('Письмо не найдено.');
 if(message.status==='sent'||message.deliveryState==='SENT')
  return {outcome:'already_resolved' as DeliveryRecoveryOutcome,messageId:id,deliveryState:'SENT'};
 if(message.status!=='unknown'||message.deliveryState!=='UNKNOWN')
  throw Error('Сверка разрешена только для отправки в состоянии UNKNOWN.');
 const rfcMessageId=String(message.rfcMessageId??'');
 if(!rfcMessageId)throw Error('У UNKNOWN-отправки нет RFC Message-ID для безопасной сверки.');
 const senderEmail=String(message.sentThrough??'');
 if(!senderEmail)throw Error('У UNKNOWN-отправки не записан исходящий ящик.');

 const credentials=await senderCredentials(ctx.accountId,senderEmail);
 if(!credentials)throw Error('Учётные данные исходящего ящика не найдены. Подключите ящик заново, не повторяя отправку.');
 const secret=credentials.secret;
 if(secret.kind!=='oauth'||!['google','microsoft'].includes(secret.provider))
  return {outcome:'unsupported' as DeliveryRecoveryOutcome,messageId:id,deliveryState:'UNKNOWN',
   reason:'PROVIDER_RECONCILIATION_UNSUPPORTED'};

 const token=await oauthAccessToken(secret.provider,secret.refreshToken,credentials.apps);
 const evidence=secret.provider==='google'
  ?await reconcileGmailSent(token,rfcMessageId)
  :await reconcileMicrosoftSent(token,rfcMessageId);
 if(!evidence)
  return {outcome:'pending' as DeliveryRecoveryOutcome,messageId:id,deliveryState:'UNKNOWN',
   reason:'DELIVERY_NOT_PROVEN_YET'};
 return change(ctx.accountId,s=>applyDeliveryEvidence(s,id,evidence));
}
