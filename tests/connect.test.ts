import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {smtpStub} from './smtpstub';
import {signIn,platformEnv} from './session';

/** Stands in for Google: tokens, sending, and the inbox the sent message lands in. */
function provider(){
 const sent:any[]=[];
 let failSend=false,deliver=true;
 const server=createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);
  req.on('end',()=>{
   res.setHeader('Content-Type','application/json');
   const url=req.url??'';
   if(url==='/token')return res.end(JSON.stringify({access_token:'stub-access',refresh_token:'stub-refresh',scope:'gmail.send'}));
   if(url.includes('/profile'))return res.end(JSON.stringify({historyId:'100'}));
   if(url.includes('/history')){res.statusCode=404;return res.end(JSON.stringify({error:{message:'history baseline expired'}}));}
   if(url.includes('/messages/send')){
    if(failSend){res.statusCode=403;return res.end(JSON.stringify({error:{message:'Delegation denied'}}));}
    sent.push({auth:req.headers.authorization,body:JSON.parse(body||'{}')});
    return res.end(JSON.stringify({id:`stub-${sent.length}`}));
   }
   if(/\/messages\/stub-\d+/.test(url)){
    const index=Number(url.match(/stub-(\d+)/)![1])-1;
    const raw=Buffer.from(sent[index]?.body?.raw??'','base64url').toString();
    const header=(name:string)=>raw.match(new RegExp(`^${name}: (.*)$`,'im'))?.[1]?.trim()??'';
    const encoded=header('Subject').match(/=\?UTF-8\?B\?(.+)\?=/i)?.[1];
    const subject=encoded?Buffer.from(encoded,'base64').toString('utf8'):header('Subject');
    const split=raw.search(/\r?\n\r?\n/);
    const body=split<0?'':raw.slice(split).replace(/^\s+/,'');
    const text=/base64/i.test(raw.slice(0,split<0?raw.length:split))
     ?Buffer.from(body.replace(/\s/g,''),'base64').toString('utf8'):body;
    return res.end(JSON.stringify({id:`stub-${index+1}`,threadId:`thread-${index+1}`,internalDate:String(Date.now()),
     payload:{headers:[{name:'From',value:header('From')},{name:'Subject',value:subject},
      {name:'Message-Id',value:header('Message-Id')||`<stub-${index+1}@example>`}],
      mimeType:'text/plain',body:{data:Buffer.from(text).toString('base64url')}}}));
   }
   if(url.includes('/messages')){
    const ids=deliver?sent.map((_,i)=>({id:`stub-${i+1}`})).reverse():[];
    return res.end(JSON.stringify({messages:ids}));
   }
   res.statusCode=404;res.end('{}');
  });
 });
 return {server,sent,failSend:(v:boolean)=>{failSend=v;},deliver:(v:boolean)=>{deliver=v;}};
}

test('a mailbox becomes ready only after every proof, and a DNS check grants nothing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-connect-'));
 const stub=provider();
 await new Promise<void>(r=>stub.server.listen(3198,'127.0.0.1',r));
 const smtp=smtpStub(3196);
 await smtp.listen();
 const base='http://127.0.0.1:3105';
 const child=spawn(process.execPath,['--import','tsx',resolve('server/index.ts')],{stdio:'pipe',env:{...process.env,
  PORT:'3105',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'operator-secret',MCP_TOKEN:'',OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',
  PUBLIC_URL:base,APP_URL:base,MAIL_PROVIDER_BASE_URL:'http://127.0.0.1:3198',
  ENCRYPTION_KEY:'connect-test-key',VERIFY_ATTEMPTS:'2',VERIFY_DELAY_MS:'50',
  ...platformEnv(3196,'operator@example.com')}});
 let logs='';child.stderr.on('data',d=>logs+=d);child.stdout.on('data',d=>logs+=d);
 let token='';
 const req=async(path:string,body?:unknown)=>{
  const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
   body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 };
 const boxOf=async(email:string)=>{
  const status=(await req('/mailboxes/status')).body;
  for(const d of status.domains)for(const m of d.mailboxes)if(m.email===email)return {domain:d,mailbox:m};
  throw Error(`no mailbox ${email}`);
 };
 try{
  for(let i=0;i<100;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal((await fetch(base+'/api/health')).status,200,logs);
  token=await signIn(base,smtp,'operator@example.com');
  const email='outreach@no-such-domain-for-sendina.example';

  await req('/platform',{google:{clientId:'platform-client',clientSecret:'platform-secret'}});
  assert.equal((await req('/platform')).body.google.configured,true);

  const detected=(await req('/mailboxes/detect',{email})).body;
  assert.equal(detected.provider,'smtp');
  assert.equal(detected.appOwner,'none');
  assert.equal((await req('/state')).body.domains.some((d:any)=>d.name.includes('no-such-domain')),false,
   'detection alone must not create anything');

  const start=(await req('/mailboxes/oauth',{email,provider:'google'})).body;
  const authorize=new URL(start.url);
  assert.equal(authorize.searchParams.get('client_id'),'platform-client','the platform application is used');
  assert.match(authorize.searchParams.get('scope')!,/gmail\.readonly/,'reading replies needs a read scope');
  const state=authorize.searchParams.get('state')!;
  assert.equal((await req('/mailboxes/status')).body.domains.length,0,'nothing connects before the redirect returns');

  const callback=await fetch(`${base}/oauth/mailbox/callback?code=stub-code&state=${state}`);
  assert.equal(callback.status,200);
  let {mailbox}=await boxOf(email);
  assert.equal(mailbox.connection,'oauth');
  assert.deepEqual(mailbox.readiness.blockers,
   ['AUTH_REQUIRED','TEST_SEND_REQUIRED','INCOMING_CHANNEL_REQUIRED','INCOMING_MESSAGE_REQUIRED','DNS_NOT_CHECKED'],
   'connecting proves nothing on its own, and every pending proof is listed');

  const stored=await readFile(join(dir,'auth.json'),'utf8');
  assert.ok(!stored.includes('stub-refresh'),'a refresh token must not be stored in the clear');
  assert.ok(stored.includes('enc.v1.'),'secrets are stored encrypted');
  assert.ok(!JSON.stringify((await req('/state')).body).includes('stub-refresh'));

  stub.deliver(false);
  const oneWay=(await req('/mailboxes/verify',{email})).body;
  assert.equal(oneWay.checks.auth.status,'ok');
  assert.equal(oneWay.checks.testSend.status,'ok');
  assert.equal(oneWay.checks.incoming.status,'failed');
  assert.equal(oneWay.ready,false);
  assert.ok(oneWay.readiness.blockers.includes('INCOMING_MESSAGE_FAILED'));

  stub.deliver(true);
  const verified=(await req('/mailboxes/verify',{email})).body;
  for(const check of ['auth','testSend','imap','incoming'])
   assert.equal(verified.checks[check].status,'ok',`${check}: ${verified.checks[check].detail}`);
  assert.equal(verified.ready,false,'the domain records are still unchecked');
  assert.deepEqual(verified.readiness.blockers,['DNS_NOT_CHECKED']);

  const {domain}=await boxOf(email);
  await req(`/domains/${domain.id}/check`,{});
  const after=await boxOf(email);
  assert.equal(after.mailbox.readiness.ready,false);
  assert.deepEqual(after.mailbox.readiness.blockers,['SPF_MISSING','DKIM_MISSING','DMARC_MISSING']);

  stub.failSend(true);
  const failed=(await req('/mailboxes/verify',{email})).body;
  assert.equal(failed.checks.testSend.status,'failed');
  assert.equal(failed.checks.incoming.status,'failed');
  stub.failSend(false);

  const campaign=(await req('/campaigns',{name:'Reply intake',market:'США',goal:'Продажа',
   context:'Кампания для проверки приёма ответов',event:'Встреча'})).body;
  await req(`/campaigns/${campaign.id}/contacts`,{contacts:[{email:'buyer@customer.example',name:'Buyer',
   company:'Customer',source:'https://customer.example/contact',basis:'Опубликованный контакт',
   reason:'Ответ на наше письмо о брони'}]});
  stub.sent.push({auth:'',body:{raw:Buffer.from(
   'From: buyer@customer.example\r\nSubject: Re: предложение\r\nMessage-Id: <reply-1@customer.example>\r\n\r\nИнтересно, давайте обсудим на встрече.'
  ).toString('base64url')}});
  const synced=(await req('/mailboxes/sync',{email})).body;
  assert.equal(synced.added,1,JSON.stringify(synced));
  const replies=(await req('/state')).body.replies;
  const arrived=replies.find((r:any)=>r.email==='buyer@customer.example');
  assert.ok(arrived,'the reply must reach the workspace');
  assert.equal(arrived.campaignId,campaign.id,'and be filed against the campaign it answers');
  assert.equal(arrived.category,'positive');
  assert.equal(arrived.source,'inbox');
  assert.equal((await req('/mailboxes/sync',{email})).body.added,0);

  await req('/mailboxes/disconnect',{email});
  const gone=await boxOf(email);
  assert.equal(gone.mailbox.connection,'none');
  assert.ok(gone.mailbox.readiness.blockers.includes('NOT_CONNECTED'));
  assert.equal((await req('/mailboxes/verify',{email})).status,422,'a disconnected mailbox cannot be verified');
 }finally{child.kill();stub.server.close();smtp.server.close();}
});