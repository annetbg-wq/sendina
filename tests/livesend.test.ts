import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {smtpStub} from './smtpstub';
import {signIn,platformEnv} from './session';

/** A message actually leaving, end to end, through the deployed server.

    Everything up to now proved that Sendina refuses to send. This proves the other half: that
    when every condition really is met a real message goes out through the connected mailbox, and
    that each of the guards still stops it when it is not. Ports: api 3113, provider stub 3216,
    DNS stub 3217, platform mail 3218. */

/** Stands in for Google: token refresh, sending, and the inbox a sent message lands in — enough
    for a mailbox to pass all four checks and then carry real campaign mail. */
function provider(){
 const sent:any[]=[];
 let failSend=false;
 const server=createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);
  req.on('end',()=>{
   res.setHeader('Content-Type','application/json');
   const url=req.url??'';
   if(url==='/token')return res.end(JSON.stringify({access_token:'stub-access',refresh_token:'stub-refresh',scope:'gmail.send'}));
   if(url.includes('/messages/send')){
    if(failSend){res.statusCode=403;return res.end(JSON.stringify({error:{message:'Delegation denied'}}));}
    const parsed=JSON.parse(body||'{}');
    const raw=Buffer.from(parsed.raw??'','base64url').toString();
    const header=(name:string)=>raw.match(new RegExp(`^${name}: (.*)$`,'im'))?.[1]?.trim()??'';
    const encoded=header('Subject').match(/=\?UTF-8\?B\?(.+)\?=/i)?.[1];
    const split=raw.search(/\r?\n\r?\n/);
    const bodyText=split<0?'':raw.slice(split).replace(/^\s+/,'');
    sent.push({to:header('To'),from:header('From'),
     subject:encoded?Buffer.from(encoded,'base64').toString('utf8'):header('Subject'),
     text:/base64/i.test(raw.slice(0,split<0?raw.length:split))
      ?Buffer.from(bodyText.replace(/\s/g,''),'base64').toString('utf8'):bodyText,
     raw});
    return res.end(JSON.stringify({id:`stub-${sent.length}`}));
   }
   if(/\/messages\/stub-\d+/.test(url)){
    const index=Number(url.match(/stub-(\d+)/)![1])-1;
    const m=sent[index];
    return res.end(JSON.stringify({internalDate:String(Date.now()),
     payload:{headers:[{name:'From',value:m?.from??''},{name:'Subject',value:m?.subject??''},
      {name:'Message-Id',value:`<stub-${index+1}@example>`}],
      mimeType:'text/plain',body:{data:Buffer.from(m?.text??'').toString('base64url')}}}));
   }
   if(url.includes('/messages'))
    return res.end(JSON.stringify({messages:sent.map((_,i)=>({id:`stub-${i+1}`})).reverse()}));
   res.statusCode=404;res.end('{}');
  });
 });
 return {server,sent,failSend:(v:boolean)=>{failSend=v;}};
}

/** A domain whose records are in order. Real SPF, DKIM and DMARC cannot be conjured up in a test. */
function dns(){
 const server=createServer((req,res)=>{
  const name=new URL(req.url??'','http://x').searchParams.get('name')??'';
  const records=name.startsWith('_dmarc.')?['v=DMARC1; p=none']
   :name.includes('._domainkey.')?['v=DKIM1; k=rsa; p=MIIBstub']
   :['v=spf1 include:stub -all'];
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({records}));
 });
 return server;
}

test('a real message leaves only when everything is in order, and every guard still stops it',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-livesend-'));
 const stub=provider();
 await new Promise<void>(r=>stub.server.listen(3216,'127.0.0.1',r));
 const dnsStub=dns();
 await new Promise<void>(r=>dnsStub.listen(3217,'127.0.0.1',r));
 const smtp=smtpStub(3218);
 await smtp.listen();
 const base='http://127.0.0.1:3113';
 const mailbox='outreach@sender.example';
 // The controlled-test fence: while this is set, nothing can reach anybody else.
 const permitted='buyer@ours.example';
 const alsoPermitted='second@ours.example';
 const child=spawn(process.execPath,['--import','tsx',resolve('server/index.ts')],{stdio:'pipe',env:{...process.env,
  PORT:'3113',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'operator-secret',MCP_TOKEN:'',OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',
  PUBLIC_URL:base,APP_URL:base,MAIL_PROVIDER_BASE_URL:'http://127.0.0.1:3216',
  DNS_TXT_BASE_URL:'http://127.0.0.1:3217',
  ENCRYPTION_KEY:'livesend-test-key',VERIFY_ATTEMPTS:'2',VERIFY_DELAY_MS:'50',
  SENDING_ENABLED:'1',SEND_ALLOWLIST:`${permitted}, ${alsoPermitted}`,SEND_MAX_PER_RUN:'10',
  ...platformEnv(3218,'operator@example.com')}});
 let logs='';child.stderr.on('data',d=>logs+=d);child.stdout.on('data',d=>logs+=d);
 let token='';
 const req=async(path:string,body?:unknown)=>{
  const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
   body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 };
 try{
  for(let i=0;i<100;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal((await fetch(base+'/api/health')).status,200,logs);
  token=await signIn(base,smtp,'operator@example.com');

  // --- Nothing can be sent until the mailbox has actually proved itself --------------------
  const campaign=(await req('/campaigns',{name:'Контролируемая отправка',market:'США',
   goal:'Продажа услуги',context:'Проверка реальной отправки через подключённый ящик.',
   event:'Встреча',control:'auto'})).body;
  await req(`/campaigns/${campaign.id}/contacts`,{contacts:[{email:permitted,name:'Покупатель',
   company:'Ours',source:'https://ours.example/contact',basis:'Опубликованный рабочий контакт',
   reason:'Компания ищет ровно то, что мы предлагаем.'}]});
  await req(`/campaigns/${campaign.id}/preview`,{limit:5});
  await req(`/campaigns/${campaign.id}/status`,{status:'active'});

  const tooEarly=await req(`/campaigns/${campaign.id}/send`,{});
  assert.equal(tooEarly.status,422);
  assert.match(tooEarly.body.error,/четыре проверки/,'no mailbox has proved itself yet');
  assert.equal((await req('/capabilities')).body.sendingEnabled,false);
  assert.equal((await req('/capabilities')).body.sendingBlocker,'SENDER_NOT_READY');

  // --- Connect the mailbox and let it pass all four checks --------------------------------
  await req('/platform',{google:{clientId:'platform-client',clientSecret:'platform-secret'}});
  const start=(await req('/mailboxes/oauth',{email:mailbox,provider:'google'})).body;
  const state=new URL(start.url).searchParams.get('state')!;
  await fetch(`${base}/oauth/mailbox/callback?code=stub-code&state=${state}`);
  const verified=(await req('/mailboxes/verify',{email:mailbox})).body;
  for(const step of ['auth','testSend','imap','incoming'])
   assert.equal(verified.checks[step].status,'ok',`${step}: ${verified.checks[step].detail}`);

  // Even proved, the domain records still have to be in place — readiness is not bypassed.
  const stillBlocked=(await req('/sender')).body;
  assert.equal(stillBlocked.sendingEnabled,false);
  const domainId=stillBlocked.domains[0].id;
  await req(`/domains/${domainId}/check`,{});

  // --- And a domain nobody gave an allowance to sends nothing ------------------------------
  const noQuota=(await req('/sender')).body;
  assert.equal(noQuota.sendingEnabled,false,'a domain with no daily limit cannot send');
  assert.equal(noQuota.sendingBlocker,'DOMAIN_LIMIT_NOT_SET');
  assert.ok(noQuota.blockers.includes('DOMAIN_LIMIT_NOT_SET'));
  const refusedForQuota=(await req(`/campaigns/${campaign.id}/send`,{})).body;
  assert.equal(refusedForQuota.sent,0);
  assert.equal(refusedForQuota.results[0].reason,'DOMAIN_LIMIT');

  await req(`/domains/${domainId}/limit`,{limit:2});
  const ready=(await req('/sender')).body;
  assert.equal(ready.sendingEnabled,true,JSON.stringify(ready.blockers));
  assert.equal(ready.sender.email,mailbox);
  assert.deepEqual(ready.allowance,{used:0,limit:2,remaining:2});
  assert.deepEqual(ready.deployment.allowlist,[permitted,alsoPermitted],'the fence is reported back');

  // --- A dry run answers the same question and sends nothing -------------------------------
  const before=stub.sent.length;
  const dry=(await req(`/campaigns/${campaign.id}/send`,{dryRun:true})).body;
  assert.equal(dry.dryRun,true);
  assert.equal(dry.sent,1,'it says the message would go');
  assert.equal(dry.results[0].reason,'CHECKS_PASSED');
  assert.equal(stub.sent.length,before,'and nothing actually left');
  assert.equal((await req('/state')).body.messages[0].status,'draft');
  assert.equal((await req('/sender')).body.allowance.used,0,'a dry run spends no allowance');

  // --- The real thing ----------------------------------------------------------------------
  const sentRun=(await req(`/campaigns/${campaign.id}/send`,{})).body;
  assert.equal(sentRun.sent,1,JSON.stringify(sentRun.results));
  assert.equal(sentRun.blocked,0);
  assert.equal(sentRun.failed,0);
  assert.equal(sentRun.sender.email,mailbox);

  // A real message, with the text the operator was shown, from the connected mailbox.
  const delivered=stub.sent[stub.sent.length-1];
  assert.equal(delivered.to,permitted);
  assert.equal(delivered.from,mailbox);
  const draftText=(await req(`/campaigns/${campaign.id}/preview`,{limit:5})).body;
  assert.ok(delivered.text.includes('Компания ищет ровно то, что мы предлагаем.'),
   'the letter carries the reason the operator reviewed');

  const after=(await req('/state')).body;
  const message=after.messages.find((m:any)=>m.campaignId===campaign.id);
  assert.equal(message.status,'sent');
  assert.ok(message.sentAt,'the time it left is recorded');
  assert.equal(message.sentThrough,mailbox,'and which mailbox carried it');
  assert.equal(after.campaigns.find((c:any)=>c.id===campaign.id).sent,1);
  assert.equal((await req('/sender')).body.allowance.used,1,'the day’s allowance is spent');
  assert.ok(after.audit.some((a:any)=>a.action.includes('Отправка «Контролируемая отправка»')),
   'and the run is written to the activity log');

  // Repeating the run sends nothing twice: there is no prepared draft left.
  const repeat=await req(`/campaigns/${campaign.id}/send`,{});
  assert.equal(repeat.status,422);
  assert.match(repeat.body.error,/подготовленных писем/);
  assert.equal(stub.sent.length,before+1,'nothing left a second time');

  // --- The fence: an address nobody named cannot be reached --------------------------------
  await req(`/campaigns/${campaign.id}/contacts`,{contacts:[{email:'stranger@elsewhere.example',
   name:'Посторонний',company:'Elsewhere',source:'https://elsewhere.example/contact',
   basis:'Опубликованный рабочий контакт',reason:'Выглядит подходящей компанией для предложения.'}]});
  await req(`/campaigns/${campaign.id}/preview`,{limit:5});
  const fenced=(await req(`/campaigns/${campaign.id}/send`,{})).body;
  assert.equal(fenced.sent,0);
  assert.equal(fenced.results[0].reason,'RECIPIENT_NOT_ALLOWLISTED');
  assert.equal(stub.sent.length,before+1,'and no message left for them');
  assert.equal((await req('/sender')).body.allowance.used,1,'a refusal costs no allowance');

  // --- The emergency stop stops it, whatever else is in order ------------------------------
  await req('/suppress',{email:'stranger@elsewhere.example'});
  await req('/stop',{stopped:true});
  const stopped=await req(`/campaigns/${campaign.id}/send`,{});
  assert.equal(stopped.status,422);
  assert.match(stopped.body.error,/Аварийная остановка/,'and says so as the reason, not as a mailbox fault');
  assert.equal((await req('/capabilities')).body.sendingBlocker,'EMERGENCY_STOP');
  assert.equal(stub.sent.length,before+1,'nothing left while the stop was on');
  // A stop switched on mid-run is caught per message inside reserve; see tests/send.test.ts.
  await req('/stop',{stopped:false});

  // --- A mailbox that stops working reports it, and gives the allowance back ---------------
  await req(`/campaigns/${campaign.id}/status`,{status:'active'});
  await req(`/campaigns/${campaign.id}/contacts`,{contacts:[{email:alsoPermitted,
   name:'Второй',company:'Ours',source:'https://ours.example/team',
   basis:'Опубликованный рабочий контакт',reason:'Второй адрес в той же организации для проверки.'}]});
  await req(`/campaigns/${campaign.id}/preview`,{limit:5});
  stub.failSend(true);
  const broken=(await req(`/campaigns/${campaign.id}/send`,{})).body;
  stub.failSend(false);
  assert.equal(broken.sent,0);
  assert.equal(broken.failed,1,JSON.stringify(broken.results));
  const failure=broken.results.find((r:any)=>r.email===alsoPermitted);
  assert.equal(failure.status,'failed');
  assert.equal(failure.reason,'SEND_FAILED');
  assert.match(failure.detail,/Gmail|Delegation/,'and says what the provider actually answered');
  // The message never left, so it must not have cost a day of the domain's allowance, and it
  // must still be a draft that a fixed mailbox can carry.
  assert.equal((await req('/sender')).body.allowance.used,1,'a failed send costs no allowance');
  const retryable=(await req('/state')).body.messages.find((m:any)=>m.email===alsoPermitted);
  assert.equal(retryable.status,'draft','so it can be sent again once the mailbox is fixed');

  // And once the mailbox works again, that same draft goes out — the last of the allowance.
  const retried=(await req(`/campaigns/${campaign.id}/send`,{})).body;
  assert.equal(retried.sent,1,JSON.stringify(retried.results));
  assert.deepEqual((await req('/sender')).body.allowance,{used:2,limit:2,remaining:0});

  // With the day's allowance spent, the quota is what refuses the next one.
  assert.equal((await req('/capabilities')).body.sendingBlocker,'DOMAIN_LIMIT');
  assert.equal(stub.sent.length,before+2,'exactly two messages were ever sent');
 }finally{child.kill();stub.server.close();dnsStub.close();smtp.server.close();}
});
