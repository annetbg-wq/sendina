import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {smtpStub} from './smtpstub';
import {signIn,platformEnv} from './session';

function googleProvider(){
 const sent:{from:string;subject:string;text:string}[]=[];
 let revoked=false;
 const server=createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
  const url=req.url??'';res.setHeader('content-type','application/json');
  if(url==='/token'){
   const grant=new URLSearchParams(body).get('grant_type');
   if(revoked&&grant==='refresh_token'){
    res.statusCode=400;return res.end(JSON.stringify({error:'invalid_grant',error_description:'Token has been revoked'}));
   }
   return res.end(JSON.stringify({access_token:'access',refresh_token:'refresh',scope:'gmail.send gmail.readonly'}));
  }
  if(url.includes('/messages/send')){
   const parsed=JSON.parse(body||'{}');
   const raw=Buffer.from(parsed.raw??'','base64url').toString('utf8');
   const header=(name:string)=>raw.match(new RegExp(`^${name}: (.*)$`,'im'))?.[1]?.trim()??'';
   const encoded=header('Subject').match(/=\?UTF-8\?B\?(.+)\?=/i)?.[1];
   const split=raw.search(/\r?\n\r?\n/);const head=raw.slice(0,split<0?raw.length:split);
   const encodedBody=split<0?'':raw.slice(split).replace(/^\s+/,'').replace(/\s/g,'');
   const text=/Content-Transfer-Encoding:\s*base64/i.test(head)?Buffer.from(encodedBody,'base64').toString('utf8'):encodedBody;
   sent.push({from:header('From'),subject:encoded?Buffer.from(encoded,'base64').toString('utf8'):header('Subject'),text});
   return res.end(JSON.stringify({id:`g-${sent.length}`,threadId:`t-${sent.length}`}));
  }
  const detail=url.match(/\/messages\/g-(\d+)/);
  if(detail){
   const index=Number(detail[1])-1,m=sent[index];
   return res.end(JSON.stringify({id:`g-${index+1}`,threadId:`t-${index+1}`,internalDate:String(Date.now()),
    payload:{headers:[{name:'From',value:m?.from??''},{name:'Subject',value:m?.subject??''},
     {name:'Message-Id',value:`<g-${index+1}@example>`}],mimeType:'text/plain',
     body:{data:Buffer.from(m?.text??'').toString('base64url')}}}));
  }
  if(url.includes('/messages'))return res.end(JSON.stringify({messages:sent.map((_,i)=>({id:`g-${i+1}`})).reverse()}));
  if(url.includes('/profile'))return res.end(JSON.stringify({historyId:'h1'}));
  res.statusCode=404;res.end('{}');
 });});
 return {server,revoke:()=>{revoked=true;}};
}

function dnsStub(){return createServer((req,res)=>{
 const name=new URL(req.url??'','http://x').searchParams.get('name')??'';
 const records=name.startsWith('_dmarc.')?['v=DMARC1; p=none']:
  name.includes('._domainkey.')?['v=DKIM1; k=rsa; p=stub']:['v=spf1 include:stub -all'];
 res.setHeader('content-type','application/json');res.end(JSON.stringify({records}));
});}

test('revoked OAuth token moves a ready mailbox to REAUTH_REQUIRED and blocks sending',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-revoked-'));
 const provider=googleProvider();await new Promise<void>(r=>provider.server.listen(3220,'127.0.0.1',r));
 const dns=dnsStub();await new Promise<void>(r=>dns.listen(3221,'127.0.0.1',r));
 const smtp=smtpStub(3222);await smtp.listen();
 const base='http://127.0.0.1:3114',mailbox='out@sender.example';
 const child=spawn(process.execPath,['--import','tsx',resolve('server/index.ts')],{stdio:'pipe',env:{...process.env,
  PORT:'3114',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'operator-secret',MCP_TOKEN:'',OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',
  PUBLIC_URL:base,APP_URL:base,MAIL_PROVIDER_BASE_URL:'http://127.0.0.1:3220',DNS_TXT_BASE_URL:'http://127.0.0.1:3221',
  ENCRYPTION_KEY:'revoked-token-test-key',VERIFY_ATTEMPTS:'2',VERIFY_DELAY_MS:'25',SENDING_ENABLED:'1',
  ...platformEnv(3222,'operator@example.com')}});
 let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 let token='';
 const api=async(path:string,body?:unknown)=>{
  const response=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
   body:body===undefined?undefined:JSON.stringify(body)});
  let data:any;try{data=await response.json();}catch{data={};}
  return {status:response.status,body:data};
 };
 try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
  assert.equal((await fetch(base+'/api/health')).status,200,logs);
  token=await signIn(base,smtp,'operator@example.com');
  await api('/platform',{google:{clientId:'platform-google',clientSecret:'platform-secret'}});
  const oauth=(await api('/mailboxes/oauth',{email:mailbox,provider:'google'})).body;
  const state=new URL(oauth.url).searchParams.get('state');assert.ok(state);
  const callback=await fetch(`${base}/oauth/mailbox/callback?code=code&state=${state}`);
  assert.equal(callback.status,200);

  const verified=(await api('/mailboxes/verify',{email:mailbox})).body;
  for(const step of ['auth','testSend','imap','incoming'])assert.equal(verified.checks[step].status,'ok',JSON.stringify(verified));
  const domainId=(await api('/mailboxes/status')).body.domains[0].id;
  await api(`/domains/${domainId}/check`,{});await api(`/domains/${domainId}/limit`,{limit:10});
  const ready=(await api('/mailboxes/status')).body.domains[0].mailboxes[0];
  assert.equal(ready.state,'READY');assert.equal(ready.ready,true);
  assert.equal((await api('/sender')).body.sendingEnabled,true);

  provider.revoke();
  const sync=await api('/mailboxes/sync',{email:mailbox,limit:10});
  assert.equal(sync.status,422,'revoked refresh token must fail the mailbox operation');

  const status=(await api('/mailboxes/status')).body.domains[0].mailboxes[0];
  assert.equal(status.state,'REAUTH_REQUIRED');
  assert.equal(status.action,'REAUTHENTICATE');
  assert.equal(status.ready,false);
  assert.ok(status.blockers.includes('PROVIDER_REAUTH_REQUIRED'));
  const sender=(await api('/sender')).body;
  assert.equal(sender.sendingEnabled,false);
  assert.equal(sender.sendingBlocker,'SENDER_NOT_READY');
  assert.equal((await api('/capabilities')).body.sendingBlocker,'SENDER_NOT_READY');

  const stored=(await api('/state')).body.domains[0].mailboxes[0].lastProviderError;
  assert.equal(stored.class,'REAUTH_REQUIRED');
  assert.equal(stored.code,'invalid_grant');
  assert.equal('detail' in stored,false,'raw revoked-token response must not be persisted');
 }finally{child.kill();provider.server.close();dns.close();smtp.server.close();}
});
