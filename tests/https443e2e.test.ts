import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {smtpStub} from './smtpstub';
import {signIn,platformEnv} from './session';

type GmailItem={id:string;threadId:string;from:string;to:string;subject:string;text:string;messageId:string;inReplyTo:string;references:string[]};

const decodeHeader=(value:string)=>{
 const encoded=value.match(/^=\?UTF-8\?B\?(.+)\?=$/i)?.[1];
 return encoded?Buffer.from(encoded,'base64').toString('utf8'):value;
};
const header=(mime:string,name:string)=>mime.match(new RegExp(`^${name}:\\s*(.*)$`,'im'))?.[1]?.trim()??'';
const parseMime=(encoded:string,id:string,threadId:string):GmailItem=>{
 const mime=Buffer.from(encoded,'base64url').toString('utf8');
 const split=mime.search(/\r?\n\r?\n/);
 const head=split<0?mime:mime.slice(0,split);
 const encodedBody=split<0?'':mime.slice(split).replace(/^\r?\n\r?\n/,'').trim();
 const text=/content-transfer-encoding:\s*base64/i.test(head)
  ?Buffer.from(encodedBody.replace(/\s/g,''),'base64').toString('utf8'):encodedBody;
 return {id,threadId,from:header(head,'From').toLowerCase(),to:header(head,'To').toLowerCase(),
  subject:decodeHeader(header(head,'Subject')),text,messageId:header(head,'Message-ID'),
  inReplyTo:header(head,'In-Reply-To'),references:header(head,'References').split(/\s+/).filter(Boolean)};
};

/** A deterministic Gmail/DNS stand-in. It keeps a real history cursor so the acceptance test can
 * establish a baseline, restart Sendina, add a reply, then prove the restarted backend resumes
 * from that exact cursor instead of rescanning or losing the event. */
function providerStub(){
 let history=100,sendNo=0;
 const messages=new Map<string,GmailItem>();
 const inbox:string[]=[];
 const additions:{history:number;id:string}[]=[];
 const calls:string[]=[];
 const historyStarts:string[]=[];
 let lastOutbound:GmailItem|null=null;

 const addInbox=(message:GmailItem)=>{
  messages.set(message.id,message);inbox.unshift(message.id);history++;
  additions.push({history,id:message.id});
 };
 const asGmail=(m:GmailItem)=>({id:m.id,threadId:m.threadId,internalDate:String(Date.now()),
  payload:{mimeType:'text/plain',headers:[
   {name:'From',value:m.from},{name:'To',value:m.to},{name:'Subject',value:m.subject},
   {name:'Message-Id',value:m.messageId},{name:'In-Reply-To',value:m.inReplyTo},
   {name:'References',value:m.references.join(' ')}],
   body:{data:Buffer.from(m.text).toString('base64url')}}});

 const server=createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);req.on('end',()=>{
   const url=new URL(req.url??'/','http://stub');calls.push(`${req.method} ${url.pathname}${url.search}`);
   res.setHeader('content-type','application/json');

   if(url.pathname==='/token')return res.end(JSON.stringify({access_token:'stub-access',refresh_token:'stub-refresh',scope:'gmail.send gmail.readonly'}));
   if(url.pathname==='/txt'){
    const name=url.searchParams.get('name')??'';
    const records=name.startsWith('_dmarc.')?['v=DMARC1; p=none']:
     name.includes('._domainkey.')?['v=DKIM1; k=rsa; p=acceptance']:
     ['v=spf1 include:_spf.sendina.test ~all'];
    return res.end(JSON.stringify({records}));
   }
   if(url.pathname==='/gmail/v1/users/me/profile')return res.end(JSON.stringify({historyId:String(history)}));
   if(url.pathname==='/gmail/v1/users/me/messages/send'){
    const payload=JSON.parse(body||'{}');const id=`send-${++sendNo}`,threadId=`thread-${sendNo}`;
    const message=parseMime(String(payload.raw??''),id,threadId);
    messages.set(id,message);
    if(message.to===message.from)addInbox(message);else lastOutbound=message;
    return res.end(JSON.stringify({id,threadId}));
   }
   if(url.pathname==='/gmail/v1/users/me/messages')
    return res.end(JSON.stringify({messages:inbox.map(id=>({id}))}));
   if(url.pathname==='/gmail/v1/users/me/history'){
    const start=url.searchParams.get('startHistoryId')??'';historyStarts.push(start);
    const after=Number(start);
    const events=additions.filter(e=>e.history>after).map(e=>({id:String(e.history),messagesAdded:[{message:{id:e.id}}]}));
    return res.end(JSON.stringify({historyId:String(history),history:events}));
   }
   const found=url.pathname.match(/^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/)?.[1];
   if(found){const message=messages.get(found);if(!message){res.statusCode=404;return res.end('{}');}return res.end(JSON.stringify(asGmail(message)));}
   res.statusCode=404;res.end('{}');
  });
 });

 return {server,calls,historyStarts,currentHistory:()=>String(history),outbound:()=>lastOutbound,
  addReply(from:string,text:string){
   assert.ok(lastOutbound,'campaign outbound must exist before a reply can be added');
   const original=lastOutbound!;
   const reply:GmailItem={id:'reply-1',threadId:original.threadId,from,to:original.from,
    subject:`Re: ${original.subject}`,text,messageId:'<reply-1@customer.example>',
    inReplyTo:original.messageId,references:[original.messageId]};
   addInbox(reply);return reply;
  }};
}

const waitHealth=async(base:string,logs:()=>string)=>{
 for(let i=0;i<100;i++){
  try{const r=await fetch(base+'/api/health');if(r.status===200)return;}catch{}
  await new Promise(r=>setTimeout(r,80));
 }
 throw Error(`Sendina did not start:\n${logs()}`);
};

const stop=async(child:ChildProcess|null)=>{
 if(!child||child.exitCode!==null)return;
 child.kill();
 await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,3000))]);
};

test('Google OAuth connect → send → restart → reply mapping works with SMTP/IMAP ports blocked',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-443-e2e-'));
 const provider=providerStub();const providerPort=3222;
 await new Promise<void>(r=>provider.server.listen(providerPort,'127.0.0.1',r));
 const smtp=smtpStub(3223);await smtp.listen();
 const base='http://127.0.0.1:3121';
 const sender='sender@workspace.example',buyer='buyer@customer.example';
 let child:ChildProcess|null=null,logs='';
 const env={...process.env,PORT:'3121',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'operator-secret',MCP_TOKEN:'',
  OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',PUBLIC_URL:base,APP_URL:base,
  MAIL_PROVIDER_BASE_URL:`http://127.0.0.1:${providerPort}`,DNS_TXT_BASE_URL:`http://127.0.0.1:${providerPort}`,
  ENCRYPTION_KEY:'https443-e2e-key',VERIFY_ATTEMPTS:'2',VERIFY_DELAY_MS:'20',
  SENDING_ENABLED:'1',SEND_MAX_PER_RUN:'5',SEND_ALLOWLIST:buyer,
  ...platformEnv(3223,'operator@example.com')};
 const start=async()=>{
  child=spawn(process.execPath,['--import','tsx','--import',resolve('tests/block-mail-ports.mjs'),resolve('server/index.ts')],
   {stdio:'pipe',env});
  child.stderr?.on('data',d=>logs+=d);child.stdout?.on('data',d=>logs+=d);
  await waitHealth(base,()=>logs);
 };
 let token='';
 const req=async(path:string,body?:unknown)=>{
  const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
   body:body===undefined?undefined:JSON.stringify(body)});
  let data:any={};try{data=await r.json();}catch{}
  assert.ok(r.status<400,`${path}: ${r.status} ${JSON.stringify(data)}\n${logs}`);return data;
 };
 const mailboxFrom=(status:any)=>status.domains.flatMap((d:any)=>d.mailboxes).find((m:any)=>m.email===sender);

 try{
  await start();
  token=await signIn(base,smtp,'operator@example.com');
  await req('/platform',{google:{clientId:'platform-google',clientSecret:'platform-google-secret'}});

  const oauth=await req('/mailboxes/oauth',{email:sender,provider:'google'});
  const state=new URL(oauth.url).searchParams.get('state');assert.ok(state);
  const callback=await fetch(`${base}/oauth/mailbox/callback?code=acceptance-code&state=${encodeURIComponent(state!)}`);
  assert.equal(callback.status,200);

  const verified=await req('/mailboxes/verify',{email:sender});
  for(const step of ['auth','testSend','imap','incoming'])assert.equal(verified.checks[step].status,'ok',JSON.stringify(verified));

  let status=await req('/mailboxes/status');
  const domain=status.domains.find((d:any)=>d.name==='workspace.example');assert.ok(domain);
  const dns=await req(`/domains/${domain.id}/check`,{});
  assert.deepEqual({spf:dns.spf,dkim:dns.dkim,dmarc:dns.dmarc},{spf:true,dkim:true,dmarc:true});
  await req(`/domains/${domain.id}/limit`,{limit:10});
  status=await req('/mailboxes/status');
  assert.equal(mailboxFrom(status)?.state,'READY');

  const campaign=await req('/campaigns',{name:'HTTPS restart acceptance',market:'США',goal:'Продажа услуги',
   context:'Проверяем реальную отправку и приём ответа через HTTPS API.',event:'Встреча',control:'auto'});
  await req(`/campaigns/${campaign.id}/contacts`,{contacts:[{email:buyer,name:'Buyer',company:'Customer',
   source:'https://customer.example/contact',basis:'Опубликованный рабочий контакт',
   reason:'Компания публично ищет способ автоматизировать обработку входящих заявок.'}]});
  const preview=await req(`/campaigns/${campaign.id}/launch-preview`,{limit:5});
  assert.equal(preview.sample.length,1);
  await req(`/campaigns/${campaign.id}/status`,{status:'active'});

  const sent=await req(`/campaigns/${campaign.id}/send`,{});
  assert.equal(sent.sent,1,JSON.stringify(sent));assert.equal(sent.failed,0);assert.equal(sent.unknown,0);
  const outbound=provider.outbound();assert.ok(outbound);assert.equal(outbound!.to,buyer);
  let workspace=await req('/state');
  const message=workspace.messages.find((m:any)=>m.campaignId===campaign.id&&m.email===buyer);
  assert.equal(message.status,'sent');assert.equal(message.deliveryState,'SENT');
  assert.equal(message.rfcMessageId,outbound!.messageId,'the persisted reconciliation key must be the one that actually left');

  const baseline=await req('/mailboxes/sync',{email:sender});
  assert.equal(baseline.added,0,'before the customer replies there is nothing to import');
  workspace=await req('/state');
  const storedMailbox=workspace.domains.flatMap((d:any)=>d.mailboxes).find((m:any)=>m.email===sender);
  const cursorBefore=storedMailbox.incomingCursor?.value;assert.equal(cursorBefore,provider.currentHistory());

  await stop(child);child=null;
  const reply=provider.addReply(buyer,'Интересно, давайте обсудим это на встрече на следующей неделе.');
  await start();

  status=await req('/mailboxes/status');
  assert.equal(mailboxFrom(status)?.state,'READY','mailbox readiness must survive the backend restart');
  const synced=await req('/mailboxes/sync',{email:sender});
  assert.equal(synced.added,1,JSON.stringify(synced));
  workspace=await req('/state');
  const arrived=workspace.replies.find((r:any)=>r.providerId===reply.id);
  assert.ok(arrived,'the incremental history event must become a workspace reply');
  assert.equal(arrived.campaignId,campaign.id);assert.equal(arrived.email,buyer);assert.equal(arrived.category,'positive');
  assert.equal(arrived.inReplyTo,message.rfcMessageId);assert.equal(arrived.threadId,outbound!.threadId);
  assert.equal(workspace.campaigns.find((c:any)=>c.id===campaign.id).positive,1);

  assert.equal((await req('/mailboxes/sync',{email:sender})).added,0,'re-reading the same provider history must be idempotent');
  assert.ok(provider.historyStarts.includes(String(cursorBefore)),'restart must resume from the persisted Gmail history cursor');
  assert.ok(!logs.includes('[BLOCKED_MAIL_PORT]'),`the HTTPS mailbox path touched a blocked legacy port:\n${logs}`);
 }finally{await stop(child);provider.server.close();smtp.server.close();}
});
