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
 const r=await fetch(providerUrl(`https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?${params}`),
  {headers:{Authorization:`Bearer ${accessToken}`}});
 if(!r.ok)throw Object.assign(new Error(`Microsoft Graph не отдал отправленное сообщение: ${(await r.text()).slice(0,200)}`),
  {status:r.status,headers:r.headers});
 const message=(await r.json())?.value?.[0];
 if(!message)return null;
 return {providerId:String(message.id??''),threadId:String(message.conversationId??''),
  messageId:String(message.internetMessageId??messageId),sentAt:String(message.sentDateTime??'')};
}
