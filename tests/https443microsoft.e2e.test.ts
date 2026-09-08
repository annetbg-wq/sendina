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

type Mime={from:string;to:string;subject:string;text:string;messageId:string};
type GraphMessage={id:string;conversationId:string;from:{emailAddress:{address:string}};subject:string;body:{content:string};bodyPreview:string;internetMessageId:string;receivedDateTime:string};

const decodeHeader=(value:string)=>{
 const encoded=value.match(/^=\?UTF-8\?B\?(.+)\?=$/i)?.[1];
 return encoded?Buffer.from(encoded,'base64').toString('utf8'):value;
};
const header=(mime:string,name:string)=>mime.match(new RegExp(`^${name}:\\s*(.*)$`,'im'))?.[1]?.trim()??'';
const parseMime=(mime:string):Mime=>{
 const split=mime.search(/\r?\n\r?\n/);const head=split<0?mime:mime.slice(0,split);
 const encodedBody=split<0?'':mime.slice(split).replace(/^\r?\n\r?\n/,'').trim();
 const text=/content-transfer-encoding:\s*base64/i.test(head)
  ?Buffer.from(encodedBody.replace(/\s/g,''),'base64').toString('utf8'):encodedBody;
 return {from:header(head,'From').toLowerCase(),to:header(head,'To').toLowerCase(),
  subject:decodeHeader(header(head,'Subject')),text,messageId:header(head,'Message-ID')};
};

/** Graph stand-in with an opaque deltaLink. The link intentionally points back to this stub:
 * production stores Graph's real HTTPS URL unchanged, and a test should exercise that same
 * "persist and reuse the exact link" behavior rather than reconstructing it. */
function graphStub(port:number){
 let version=0,sendNo=0;const inbox:GraphMessage[]=[];const events:{version:number;message:GraphMessage}[]=[];
 const calls:string[]=[];const deltaStarts:string[]=[];let lastOutbound:(Mime&{id:string})|null=null;
 const deltaLink=()=>`http://127.0.0.1:${port}/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=${version}`;
 const addInbox=(message:GraphMessage)=>{inbox.unshift(message);version++;events.push({version,message});};
 const asGraph=(mime:Mime,id:string,conversationId:string):GraphMessage=>({id,conversationId,
  from:{emailAddress:{address:mime.from}},subject:mime.subject,body:{content:mime.text},bodyPreview:mime.text,
  internetMessageId:mime.messageId,receivedDateTime:new Date().toISOString()});

 const server=createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);req.on('end',()=>{
   const url=new URL(req.url??'/','http://stub');calls.push(`${req.method} ${url.pathname}${url.search}`);
   res.setHeader('content-type','application/json');
   if(url.pathname.endsWith('/oauth2/v2.0/token'))
    return res.end(JSON.stringify({access_token:'graph-access',refresh_token:'graph-refresh',scope:'Mail.Send Mail.Read offline_access'}));
   if(url.pathname==='/txt'){
    const name=url.searchParams.get('name')??'';
    const records=name.startsWith('_dmarc.')?['v=DMARC1; p=none']:
     name.includes('._domainkey.')?['v=DKIM1; k=rsa; p=acceptance']:
     ['v=spf1 include:_spf.sendina.test ~all'];
    return res.end(JSON.stringify({records}));
   }
   if(url.pathname==='/v1.0/me/sendMail'){
    const mime=parseMime(Buffer.from(body,'base64').toString('utf8'));
    const id=`graph-send-${++sendNo}`,conversationId=`conversation-${sendNo}`;
    if(mime.to===mime.from)addInbox(asGraph(mime,id,conversationId));else lastOutbound={...mime,id};
    res.statusCode=202;return res.end('{}');
   }
   if(url.pathname==='/v1.0/me/messages')
    return res.end(JSON.stringify({value:inbox.slice(0,Number(url.searchParams.get('$top')??25))}));
   if(url.pathname==='/v1.0/me/mailFolders/inbox/messages/delta'){
    const token=url.searchParams.get('$deltatoken');
    if(token!==null){deltaStarts.push(token);const after=Number(token);
     return res.end(JSON.stringify({value:events.filter(e=>e.version>after).map(e=>e.message),'@odata.deltaLink':deltaLink()}));}
    return res.end(JSON.stringify({value:[...inbox].reverse(),'@odata.deltaLink':deltaLink()}));
   }
   res.statusCode=404;res.end('{}');
  });
 });
 return {server,calls,deltaStarts,currentVersion:()=>String(version),outbound:()=>lastOutbound,
  addReply(from:string,text:string){
   assert.ok(lastOutbound,'campaign outbound must exist before a reply can be added');const original=lastOutbound!;
   const reply:GraphMessage={id:'graph-reply-1',conversationId:'conversation-reply-1',
    from:{emailAddress:{address:from}},subject:`Re: ${original.subject}`,body:{content:text},bodyPreview:text,
    internetMessageId:'<graph-reply-1@customer.example>',receivedDateTime:new Date().toISOString()};
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
 if(!child||child.exitCode!==null)return;child.kill();
 await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,3000))]);
};

test('Microsoft OAuth connect → send → restart → reply mapping works with SMTP/IMAP ports blocked',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-443-ms-e2e-'));const providerPort=3224;
 const provider=graphStub(providerPort);await new Promise<void>(r=>provider.server.listen(providerPort,'127.0.0.1',r));
 const smtp=smtpStub(3225);await smtp.listen();
 const base='http://127.0.0.1:3122';const sender='sender@m365.example',buyer='buyer@customer.example';
 let child:ChildProcess|null=null,logs='';
 const env={...process.env,PORT:'3122',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'operator-secret',MCP_TOKEN:'',
  OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',PUBLIC_URL:base,APP_URL:base,
  MAIL_PROVIDER_BASE_URL:`http://127.0.0.1:${providerPort}`,DNS_TXT_BASE_URL:`http://127.0.0.1:${providerPort}`,
  ENCRYPTION_KEY:'https443-ms-e2e-key',VERIFY_ATTEMPTS:'2',VERIFY_DELAY_MS:'20',
  SENDING_ENABLED:'1',SEND_MAX_PER_RUN:'5',SEND_ALLOWLIST:buyer,
  ...platformEnv(3225,'operator@example.com')};
 const start=async()=>{child=spawn(process.execPath,['--import','tsx','--import',resolve('tests/block-mail-ports.mjs'),resolve('server/index.ts')],{stdio:'pipe',env});
  child.stderr?.on('data',d=>logs+=d);child.stdout?.on('data',d=>logs+=d);await waitHealth(base,()=>logs);};
 let token='';
 const req=async(path:string,body?:unknown)=>{
  const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
   body:body===undefined?undefined:JSON.stringify(body)});let data:any={};try{data=await r.json();}catch{}
  assert.ok(r.status<400,`${path}: ${r.status} ${JSON.stringify(data)}\n${logs}`);return data;
 };
 const mailboxFrom=(status:any)=>status.domains.flatMap((d:any)=>d.mailboxes).find((m:any)=>m.email===sender);
 try{
  await start();token=await signIn(base,smtp,'operator@example.com');
  await req('/platform',{microsoft:{clientId:'platform-ms',clientSecret:'platform-ms-secret',tenant:'common'}});
  const oauth=await req('/mailboxes/oauth',{email:sender,provider:'microsoft'});
  const state=new URL(oauth.url).searchParams.get('state');assert.ok(state);
  const callback=await fetch(`${base}/oauth/mailbox/callback?code=acceptance-code&state=${encodeURIComponent(state!)}`);assert.equal(callback.status,200);

  const verified=await req('/mailboxes/verify',{email:sender});
  for(const step of ['auth','testSend','imap','incoming'])assert.equal(verified.checks[step].status,'ok',JSON.stringify(verified));
  let status=await req('/mailboxes/status');const domain=status.domains.find((d:any)=>d.name==='m365.example');assert.ok(domain);
  const dns=await req(`/domains/${domain.id}/check`,{});assert.deepEqual({spf:dns.spf,dkim:dns.dkim,dmarc:dns.dmarc},{spf:true,dkim:true,dmarc:true});
  await req(`/domains/${domain.id}/limit`,{limit:10});status=await req('/mailboxes/status');assert.equal(mailboxFrom(status)?.state,'READY');

  const campaign=await req('/campaigns',{name:'Graph restart acceptance',market:'США',goal:'Продажа услуги',
   context:'Проверяем реальную отправку и приём ответа через Microsoft Graph API.',event:'Встреча',control:'auto'});
  await req(`/campaigns/${campaign.id}/contacts`,{contacts:[{email:buyer,name:'Buyer',company:'Customer',source:'https://customer.example/contact',
   basis:'Опубликованный рабочий контакт',reason:'Компания публично ищет способ автоматизировать обработку входящих заявок.'}]});
  const preview=await req(`/campaigns/${campaign.id}/launch-preview`,{limit:5});assert.equal(preview.sample.length,1);
  await req(`/campaigns/${campaign.id}/status`,{status:'active'});
  const sent=await req(`/campaigns/${campaign.id}/send`,{});assert.equal(sent.sent,1,JSON.stringify(sent));assert.equal(sent.failed,0);assert.equal(sent.unknown,0);
  const outbound=provider.outbound();assert.ok(outbound);assert.equal(outbound!.to,buyer);
  let workspace=await req('/state');const message=workspace.messages.find((m:any)=>m.campaignId===campaign.id&&m.email===buyer);
  assert.equal(message.status,'sent');assert.equal(message.deliveryState,'SENT');
  assert.equal(message.rfcMessageId,outbound!.messageId,'the stable RFC Message-ID must be the one Graph accepted');

  const baseline=await req('/mailboxes/sync',{email:sender});assert.equal(baseline.added,0);
  workspace=await req('/state');const storedMailbox=workspace.domains.flatMap((d:any)=>d.mailboxes).find((m:any)=>m.email===sender);
  const cursorBefore=storedMailbox.incomingCursor?.value;assert.ok(String(cursorBefore).includes(`$deltatoken=${provider.currentVersion()}`));

  await stop(child);child=null;const reply=provider.addReply(buyer,'Интересно, давайте обсудим это на встрече на следующей неделе.');await start();
  status=await req('/mailboxes/status');assert.equal(mailboxFrom(status)?.state,'READY','mailbox readiness must survive the backend restart');
  const synced=await req('/mailboxes/sync',{email:sender});assert.equal(synced.added,1,JSON.stringify(synced));
  workspace=await req('/state');const arrived=workspace.replies.find((r:any)=>r.providerId===reply.id);
  assert.ok(arrived,'the Graph delta event must become a workspace reply');assert.equal(arrived.campaignId,campaign.id);
  assert.equal(arrived.email,buyer);assert.equal(arrived.category,'positive');assert.equal(arrived.provider,'microsoft');assert.equal(arrived.threadId,reply.conversationId);
  assert.equal(workspace.campaigns.find((c:any)=>c.id===campaign.id).positive,1);
  assert.equal((await req('/mailboxes/sync',{email:sender})).added,0,'re-reading the same delta must be idempotent');
  assert.ok(provider.deltaStarts.includes(provider.currentVersion()==='0'?'0':String(Number(provider.currentVersion())-1)),
   `restart must reuse the persisted delta token: ${provider.deltaStarts.join(',')}`);
  assert.ok(!logs.includes('[BLOCKED_MAIL_PORT]'),`the Graph mailbox path touched a blocked legacy port:\n${logs}`);
 }finally{await stop(child);provider.server.close();smtp.server.close();}
});
