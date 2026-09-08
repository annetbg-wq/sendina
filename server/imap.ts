import {ImapFlow} from 'imapflow';
import {limits} from './timeout';

/** Incoming mail. Nothing about a mailbox counts as working until a real message is read back. */
export type ImapAccess={host:string;port:number;secure:boolean;user:string;pass:string};
export type Incoming={
 uid:number;
 from:string;
 subject:string;
 text:string;
 messageId:string;
 inReplyTo:string;
 references:string[];
 at:string;
 /** Stable provider-side identity used for deduplication/recovery when available. */
 providerId?:string;
 /** Provider conversation/thread identity when available. */
 threadId?:string;
};

/** A wrong IMAP host usually accepts the connection and then never sends a greeting, so the
    client needs its own limits: without them the read waits on the operating system and the
    request that is waiting for it never returns. */
const connect=async(access:ImapAccess)=>{
 const {phase}=limits();
 const client=new ImapFlow({host:access.host,port:access.port,secure:access.secure,
  auth:{user:access.user,pass:access.pass},logger:false,
  connectionTimeout:phase,greetingTimeout:phase,socketTimeout:phase,
  tls:{rejectUnauthorized:process.env.IMAP_ALLOW_SELF_SIGNED!=='1'}});
 await client.connect();
 return client;
};

export async function verifyImap(access:ImapAccess){
 const client=await connect(access);
 try{const box=await client.mailboxOpen('INBOX');return {messages:Number(box.exists??0)};}
 finally{await client.logout().catch(()=>{});}
}

const addressOf=(value:any)=>String(value?.value?.[0]?.address??'').toLowerCase();
const listOf=(value:any)=>Array.isArray(value)?value.map(String):value?String(value).split(/\s+/).filter(Boolean):[];

/** Reads recent messages once. Polling stays the caller's decision. */
export async function fetchIncoming(access:ImapAccess,opts:{sinceUid?:number;limit?:number}={}):Promise<Incoming[]>{
 const client=await connect(access);
 const out:Incoming[]=[];
 try{
  await client.mailboxOpen('INBOX');
  const range=opts.sinceUid?`${opts.sinceUid+1}:*`:'1:*';
  const limit=opts.limit??50;
  for await(const message of client.fetch(range,{uid:true,envelope:true,source:true},{uid:true})){
   const raw=message.source?.toString('utf8')??'';
   const separator=raw.indexOf('\r\n\r\n');
   const headers=separator<0?raw:raw.slice(0,separator);
   const body=separator<0?'':raw.slice(separator+4);
   out.push({uid:Number(message.uid),
    from:addressOf(message.envelope?.from?[{value:[{address:message.envelope.from[0]?.address}]}][0]:null)
      ||String(message.envelope?.from?.[0]?.address??'').toLowerCase(),
    subject:String(message.envelope?.subject??''),
    text:decodeBody(headers,body),
    messageId:String(message.envelope?.messageId??''),
    inReplyTo:String(message.envelope?.inReplyTo??''),
    references:listOf(headers.match(/^references:\s*(.+)$/im)?.[1]),
    at:new Date(message.envelope?.date??Date.now()).toISOString(),
    providerId:`imap:${Number(message.uid)}`});
  }
 }finally{await client.logout().catch(()=>{});}
 return out.sort((a,b)=>a.uid-b.uid).slice(-1*(opts.limit??50));
}

/** Message bodies arrive encoded; a reply is useless until it is readable. */
function decodeBody(headers:string,body:string){
 const encoding=(headers.match(/^content-transfer-encoding:\s*(\S+)/im)?.[1]??'').toLowerCase();
 if(encoding==='base64')return Buffer.from(body.replace(/\s/g,''),'base64').toString('utf8');
 if(encoding==='quoted-printable')
  return body.replace(/=\r?\n/g,'').replace(/=([0-9A-F]{2})/gi,(_m,hex)=>String.fromCharCode(parseInt(hex,16)));
 return body;
}

/** Waits for one specific message to appear, which is how the incoming channel proves itself. */
export async function waitForMessage(access:ImapAccess,marker:string,attempts=6,delayMs=2500){
 for(let attempt=0;attempt<attempts;attempt++){
  try{
   const messages=await fetchIncoming(access,{limit:30});
   const found=messages.find(m=>m.subject.includes(marker)||m.text.includes(marker));
   if(found)return found;
  }catch(e:any){if(attempt===attempts-1)throw e;}
  if(attempt<attempts-1)await new Promise(r=>setTimeout(r,delayMs));
 }
 return null;
}
