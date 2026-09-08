import {providerRequest} from './providerrequest';

export type SentIdentity={providerId:string;threadId:string;messageId:string;sentAt:string};

const providerUrl=(url:string)=>{const base=process.env.MAIL_PROVIDER_BASE_URL;
 if(!base)return url;const parsed=new URL(url);return new URL(parsed.pathname+parsed.search,base).toString();};
const odataString=(value:string)=>`'${value.replace(/'/g,"''")}'`;

/**
 * Graph sendMail returns 202 with no message id. With Mail.Read already granted, Sendina can
 * reconcile the accepted message in Sent Items by the deterministic RFC Message-ID it supplied.
 */
export async function reconcileMicrosoftSent(accessToken:string,messageId:string):Promise<SentIdentity|null>{
 const params=new URLSearchParams({
  '$filter':`internetMessageId eq ${odataString(messageId)}`,
  '$select':'id,conversationId,internetMessageId,sentDateTime',
  '$top':'1'
 });
 const r=await providerRequest(providerUrl(`https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?${params}`),
  {headers:{Authorization:`Bearer ${accessToken}`}},{mode:'read'});
 const message=(await r.json())?.value?.[0];
 if(!message)return null;
 return {providerId:String(message.id??''),threadId:String(message.conversationId??''),
  messageId:String(message.internetMessageId??messageId),sentAt:String(message.sentDateTime??'')};
}

/**
 * Gmail search accepts the same query syntax as the Gmail UI, including rfc822msgid. Restricting
 * the search to SENT prevents an incoming copy with the same References chain from becoming
 * delivery evidence. The second request reads only metadata needed for reconciliation.
 */
export async function reconcileGmailSent(accessToken:string,messageId:string):Promise<SentIdentity|null>{
 const params=new URLSearchParams({q:`rfc822msgid:${messageId}`,labelIds:'SENT',maxResults:'1'});
 const auth={Authorization:`Bearer ${accessToken}`};
 const listed=await providerRequest(providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`),
  {headers:auth},{mode:'read'});
 const item=(await listed.json())?.messages?.[0];
 if(!item?.id)return null;
 const detailParams=new URLSearchParams({format:'metadata'});
 detailParams.append('metadataHeaders','Message-Id');
 const detail=await providerRequest(providerUrl(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(String(item.id))}?${detailParams}`),
  {headers:auth},{mode:'read'});
 const message=await detail.json();
 const headers:Record<string,string>={};
 for(const h of message?.payload?.headers??[])headers[String(h.name).toLowerCase()]=String(h.value);
 return {providerId:String(message?.id??item.id),threadId:String(message?.threadId??item.threadId??''),
  messageId:headers['message-id']??messageId,
  sentAt:new Date(Number(message?.internalDate??Date.now())).toISOString()};
}
