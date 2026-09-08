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

type Item={id:string;threadId:string;from:string;to:string;subject:string;text:string;messageId:string};
const header=(mime:string,name:string)=>mime.match(new RegExp(`^${name}:\\s*(.*)$`,'im'))?.[1]?.trim()??'';
const decodeHeader=(value:string)=>{const encoded=value.match(/^=\?UTF-8\?B\?(.+)\?=$/i)?.[1];return encoded?Buffer.from(encoded,'base64').toString('utf8'):value;};
const parseMime=(encoded:string,id:string,threadId:string):Item=>{
 const mime=Buffer.from(encoded,'base64url').toString('utf8');
 const split=mime.search(/\r?\n\r?\n/);const head=split<0?mime:mime.slice(0,split);
 const body=split<0?'':mime.slice(split).replace(/^\r?\n\r?\n/,'').trim();
 const text=/content-transfer-encoding:\s*base64/i.test(head)?Buffer.from(body.replace(/\s/g,''),'base64').toString('utf8'):body;
 return {id,threadId,from:header(head,'From').toLowerCase(),to:header(head,'To').toLowerCase(),
  subject:decodeHeader(header(head,'Subject')),text,messageId:header(head,'Message-ID')};
};

function providerStub(){
 let revokedFirst=false,sendNo=0,buyerSends=0,history=100;
 const messages=new Map<string,Item>(),inbox:string[]=[];
 const server=createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);req.on('end',()=>{
   const url=new URL(req.url??'/','http://stub');res.setHeader('content-type','application/json');
   if(url.pathname==='/token'){
    const form=new URLSearchParams(body);const grant=form.get('grant_type');
    if(grant==='authorization_code'){
     const code=form.get('code');const refresh=code==='second-code'?'refresh-2':'refresh-1';
     return res.end(JSON.stringify({access_token:`access-${refresh}`,refresh_token:refresh,scope:'gmail.send gmail.readonly'}));
    }
    const refresh=form.get('refresh_token');
    if(refresh==='refresh-1'&&revokedFirst){res.statusCode=400;return res.end(JSON.stringify({error:'invalid_grant',error_description:'Token has been revoked'}));}
    return res.end(JSON.stringify({access_token:`access-${refresh||'unknown'}`}));
   }
   if(url.pathname==='/txt'){
    const name=url.searchParams.get('name')??'';
    const records=name.startsWith('_dmarc.')?['v=DMARC1; p=none']:
     name.includes('._domainkey.')?['v=DKIM1; k=rsa; p=reauth']:['v=spf1 include:_spf.sendina.test ~all'];
    return res.end(JSON.stringify({records}));
   }
   if(url.pathname==='/gmail/v1/users/me/profile')return res.end(JSON.stringify({historyId:String(history)}));
   if(url.pathname==='/gmail/v1/users/me/messages/send'){
    const payload=JSON.parse(body||'{}');const id=`send-${++sendNo}`,threadId=`thread-${sendNo}`;
    const item=parseMime(String(payload.raw??''),id,threadId);messages.set(id,item);
    if(item.to===item.from){inbox.unshift(id);history++;}else buyerSends++;
    return res.end(JSON.stringify({id,threadId}));
   }
   if(url.pathname==='/gmail/v1/users/me/messages')return res.end(JSON.stringify({messages:inbox.map(id=>({id}))}));
   if(url.pathname==='/gmail/v1/users/me/history')return res.end(JSON.stringify({historyId:String(history),history:[]}));
   const found=url.pathname.match(/^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/)?.[1];
   if(found){
    const item=messages.get(found);if(!item){res.statusCode=404;return res.end('{}');}
    return res.end(JSON.stringify({id:item.id,threadId:item.threadId,internalDate:String(Date.now()),payload:{mimeType:'text/plain',headers:[
     {name:'From',value:item.from},{name:'To',value:item.to},{name:'Subject',value:item.subject},{name:'Message-Id',value:item.messageId}
    ],body:{data:Buffer.from(item.text).toString('base64url')}}}));
   }
   res.statusCode=404;res.end('{}');
  });
 });
 return {server,revokeFirst:()=>{revokedFirst=true;},buyerSends:()=>buyerSends};
}

const waitHealth=async(base:string,logs:()=>string)=>{
 for(let i=0;i<100;i++){try{const r=await fetch(base+'/api/health');if(r.status===200)return;}catch{}await new Promise(r=>setTimeout(r,80));}
 throw Error(`Sendina did not start:\n${logs()}`);
};
const stop=async(child:ChildProcess|null)=>{if(!child||child.exitCode!==null)return;child.kill();await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,3000))]);};

test('revoked Gmail token → REAUTH_REQUIRED → send blocked → reconnect → verify → READY',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-reauth-e2e-'));
 const provider=providerStub();const providerPort=3228;await new Promise<void>(r=>provider.server.listen(providerPort,'127.0.0.1',r));
 const smtp=smtpStub(3229);await smtp.listen();
 const base='http://127.0.0.1:3124',sender='sender@workspace.example',buyer='buyer@customer.example';
 let child:ChildProcess|null=null,logs='';
 const env={...process.env,PORT:'3124',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'operator-secret',MCP_TOKEN:'',OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',
  PUBLIC_URL:base,APP_URL:base,MAIL_PROVIDER_BASE_URL:`http://127.0.0.1:${providerPort}`,DNS_TXT_BASE_URL:`http://127.0.0.1:${providerPort}`,
  ENCRYPTION_KEY:'revoked-reauth-e2e-key',VERIFY_ATTEMPTS:'2',VERIFY_DELAY_MS:'20',MAIL_SYNC_INTERVAL_MS:'0',
  SENDING_ENABLED:'1',SEND_MAX_PER_RUN:'5',SEND_ALLOWLIST:buyer,...platformEnv(3229,'operator@example.com')};
 const start=async()=>{child=spawn(process.execPath,['--import','tsx','--import',resolve('tests/block-mail-ports.mjs'),resolve('server/index.ts')],{stdio:'pipe',env});
  child.stderr?.on('data',d=>logs+=d);child.stdout?.on('data',d=>logs+=d);await waitHealth(base,()=>logs);};
 let token='';
 const raw=async(path:string,body?:unknown)=>{const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:body===undefined?undefined:JSON.stringify(body)});let data:any={};try{data=await r.json();}catch{}return {status:r.status,body:data};};
 const req=async(path:string,body?:unknown)=>{const r=await raw(path,body);assert.ok(r.status<400,`${path}: ${r.status} ${JSON.stringify(r.body)}\n${logs}`);return r.body;};
 const mailboxFrom=(status:any)=>status.domains.flatMap((d:any)=>d.mailboxes).find((m:any)=>m.email===sender);
 try{
  await start();token=await signIn(base,smtp,'operator@example.com');
  await req('/platform',{google:{clientId:'platform-google',clientSecret:'platform-secret'}});
  const first=await req('/mailboxes/oauth',{email:sender,provider:'google'});const state1=new URL(first.url).searchParams.get('state');assert.ok(state1);
  assert.equal((await fetch(`${base}/oauth/mailbox/callback?code=first-code&state=${encodeURIComponent(state1!)}`)).status,200);
  const verified=await req('/mailboxes/verify',{email:sender});for(const step of ['auth','testSend','imap','incoming'])assert.equal(verified.checks[step].status,'ok',JSON.stringify(verified));
  let status=await req('/mailboxes/status');const domain=status.domains.find((d:any)=>d.name==='workspace.example');assert.ok(domain);
  await req(`/domains/${domain.id}/check`,{});await req(`/domains/${domain.id}/limit`,{limit:10});
  status=await req('/mailboxes/status');assert.equal(mailboxFrom(status).state,'READY');

  const campaign=await req('/campaigns',{name:'Revoked token acceptance',market:'США',goal:'Продажа услуги',context:'Проверяем блокировку отправки после отзыва OAuth токена.',event:'Встреча',control:'auto'});
  await req(`/campaigns/${campaign.id}/contacts`,{contacts:[{email:buyer,name:'Buyer',company:'Customer',source:'https://customer.example/contact',basis:'Опубликованный рабочий контакт',reason:'Компания публично ищет автоматизацию обработки входящих обращений.'}]});
  await req(`/campaigns/${campaign.id}/launch-preview`,{limit:5});await req(`/campaigns/${campaign.id}/status`,{status:'active'});

  provider.revokeFirst();
  const failedSync=await raw('/mailboxes/sync',{email:sender});assert.ok(failedSync.status>=400,JSON.stringify(failedSync));
  status=await req('/mailboxes/status');let mailbox=mailboxFrom(status);
  assert.equal(mailbox.state,'REAUTH_REQUIRED');assert.equal(mailbox.action,'REAUTHENTICATE');
  assert.ok(mailbox.blockers.includes('PROVIDER_REAUTH_REQUIRED'));
  const senderState=await req('/sender');assert.equal(senderState.ready,false);assert.equal(senderState.sender,null);
  const sendsBefore=provider.buyerSends();
  const blockedSend=await raw(`/campaigns/${campaign.id}/send`,{});assert.ok(blockedSend.status>=400,JSON.stringify(blockedSend));
  assert.equal(provider.buyerSends(),sendsBefore,'revoked credential must be blocked before any provider send request');

  const second=await req('/mailboxes/oauth',{email:sender,provider:'google'});const state2=new URL(second.url).searchParams.get('state');assert.ok(state2);
  assert.equal((await fetch(`${base}/oauth/mailbox/callback?code=second-code&state=${encodeURIComponent(state2!)}`)).status,200);
  status=await req('/mailboxes/status');mailbox=mailboxFrom(status);
  assert.equal(mailbox.state,'CONNECTING','a new token retires the old revoked-token error but cannot inherit its proofs');
  assert.equal(mailbox.action,'VERIFY');assert.equal(mailbox.ready,false);

  const reverified=await req('/mailboxes/verify',{email:sender});for(const step of ['auth','testSend','imap','incoming'])assert.equal(reverified.checks[step].status,'ok',JSON.stringify(reverified));
  status=await req('/mailboxes/status');assert.equal(mailboxFrom(status).state,'READY');
  const sent=await req(`/campaigns/${campaign.id}/send`,{});assert.equal(sent.sent,1,JSON.stringify(sent));assert.equal(sent.failed,0);assert.equal(sent.unknown,0);
  assert.equal(provider.buyerSends(),sendsBefore+1,'exactly one campaign message may leave after successful reauth');
  assert.ok(!logs.includes('[BLOCKED_MAIL_PORT]'),`the OAuth path touched a blocked SMTP/IMAP port:\n${logs}`);
 }finally{await stop(child);provider.server.close();smtp.server.close();}
});
