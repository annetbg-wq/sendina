import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer as createTcpServer} from 'node:net';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {smtpStub,messageText} from './smtpstub';
import {platformEnv} from './session';

/** The defects this file covers were all found by driving the deployed product by hand, and each
    one is the same shape: a screen waiting on something that never came back, or a screen that
    could not show what the server already knew. Ports: api 3112, platform mail 3213, black hole
    3215. */

/** A socket that accepts the connection and then says nothing at all — which is what a wrong SMTP
    or IMAP host actually does, and what no amount of retrying will improve. Refusing the
    connection would be the easy case; this is the one that used to hang the interface. */
function blackHole(port:number){
 const server=createTcpServer(socket=>{socket.on('error',()=>{});/* never writes a greeting */});
 return {server,listen:()=>new Promise<void>(r=>server.listen(port,'127.0.0.1',r))};
}

const factors={pain:9,urgency:8,willingnessToPay:7,buyerReach:6,aiAdvantage:8,marketSize:7,
 implementation:3,salesDifficulty:4,competition:3,legalRisk:2};
const card=(name:string,market:string,niche:string)=>({
 name,market,niche,
 summary:'Небольшие сервисные компании теряют заявки, потому что отвечают на них вручную и с задержкой.',
 audience:'Владельцы сервисных компаний от 5 до 50 человек',
 whyNow:'Стоимость обработки заявки выросла, а обученные модели стали доступны без своей инфраструктуры.',
 whyHere:'На этом рынке много небольших компаний с высокой конкуренцией за входящие заявки.',
 ticket:'1500–4000 $ в месяц',
 pain:'Заявка остывает за часы, а ответ уходит на следующий день, и клиент уходит к конкуренту.',
 payingPower:'Стоимость одной потерянной заявки выше месячной подписки',
 reach:'Отраслевые каталоги и профессиональные сообщества',
 why:'Понятная боль, измеримый результат и короткий цикл внедрения.',
 factors});

test('a mailbox check always ends, a login link opens, and a chat can work without a model in Sendina',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-production-'));
 const smtp=smtpStub(3213);
 await smtp.listen();
 const hole=blackHole(3215);
 await hole.listen();
 const base='http://127.0.0.1:3112';
 // The interface is deployed on GitHub Pages: a different origin, and a static host with no
 // /auth/callback of its own. This is exactly the arrangement the login link has to survive.
 const appUrl='https://annetbg-wq.github.io/sendina';
 const child=spawn(process.execPath,['--import','tsx',resolve('server/index.ts')],{stdio:'pipe',env:{...process.env,
  PORT:'3112',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'operator-secret',MCP_TOKEN:'production-mcp-token',
  MCP_ACCOUNT_EMAIL:'operator@example.com',OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',
  PUBLIC_URL:base,APP_URL:appUrl,ENCRYPTION_KEY:'production-test-key',
  // Short enough that the test finishes, long enough to be a real deadline rather than an instant refusal.
  MAIL_PHASE_TIMEOUT_MS:'1500',MAIL_READBACK_TIMEOUT_MS:'2000',MAIL_VERIFY_TIMEOUT_MS:'8000',
  VERIFY_ATTEMPTS:'2',VERIFY_DELAY_MS:'50',
  ...platformEnv(3213,'operator@example.com')}});
 let logs='';child.stderr.on('data',d=>logs+=d);child.stdout.on('data',d=>logs+=d);
 let token='';
 const req=async(path:string,body?:unknown)=>{
  const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
   body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 };
 const client=new Client({name:'production-test',version:'1'});
 try{
  for(let i=0;i<100;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal((await fetch(base+'/api/health')).status,200,logs);

  // --- The login link must be one a person can open, on the deployment they actually have ------
  const asked=await fetch(`${base}/api/auth/request`,{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'operator@example.com'})});
  assert.equal((await asked.json()).status,'sent');
  const delivered=smtp.inbox.filter(m=>m.to==='operator@example.com').pop();
  const link=messageText(delivered!.body).match(/(https?:\/\/\S*auth\/callback\S*)/)?.[1];
  assert.ok(link,'the mail must carry a login link');
  // The callback is a route on this server. Addressing it at APP_URL pointed a static host at a
  // path it does not serve, which is the 404 the tester had to edit the address by hand to escape.
  assert.equal(new URL(link!).origin,new URL(base).origin,
   'the login link must address the backend, which is the only place /auth/callback exists');
  assert.notEqual(new URL(link!).origin,new URL(appUrl).origin);
  // Opened exactly as it arrived — no editing — it signs the person in and hands them to the interface.
  const followed=await fetch(link!,{redirect:'manual'});
  assert.equal(followed.status,302);
  const destination=new URL(followed.headers.get('location')!);
  assert.equal(destination.origin,new URL(appUrl).origin,'and afterwards sends them to APP_URL');
  token=decodeURIComponent(destination.hash.match(/session=([^&]+)/)![1]);
  assert.ok(token,'the callback hands back a session');

  // --- Gmail is offered consent first, and the advanced route is never an empty form -----------
  const withoutApp=(await req('/mailboxes/detect',{email:'sales@gmail.com'})).body;
  assert.equal(withoutApp.provider,'google');
  assert.equal(withoutApp.route,'oauth-unconfigured');
  assert.equal(withoutApp.blocker.code,'PLATFORM_OAUTH_APP_MISSING','a superadmin is told what is missing');
  assert.equal(withoutApp.blocker.where.screen,'Аккаунты','and exactly where it is fixed');
  // The defect: no settings at all reached the interface, so the person was asked to type
  // smtp.gmail.com and imap.gmail.com by hand and only found out one field at a time.
  assert.equal(withoutApp.settings.smtp.host,'smtp.gmail.com');
  assert.equal(withoutApp.settings.imap.host,'imap.gmail.com');
  assert.equal(withoutApp.settings.smtp.port,465);
  assert.equal(withoutApp.settings.imap.port,993);
  assert.equal(withoutApp.settings.smtp.secure,true);
  assert.equal(withoutApp.settings.usernameIsEmail,true,'the username is the address that was typed');
  assert.equal(withoutApp.advancedOnly,true,'and the password route is all there is until the app exists');

  await req('/platform',{google:{clientId:'platform-client',clientSecret:'platform-secret'}});
  const withApp=(await req('/mailboxes/detect',{email:'sales@gmail.com'})).body;
  assert.equal(withApp.route,'oauth','once the platform application exists, consent is the way in');
  assert.equal(withApp.blocker,null);
  assert.equal(withApp.advancedOnly,false);
  assert.equal(withApp.settings.smtp.host,'smtp.gmail.com','the advanced route stays filled in behind it');

  // --- A check against a host that never answers still returns, and says where it stopped ------
  const started=Date.now();
  const stalled=(await req('/mailboxes/connect',{email:'outreach@stalled.example',
   smtp:{host:'127.0.0.1',port:3215,secure:false},
   imap:{host:'127.0.0.1',port:3215,secure:false},
   pass:'app-password'})).body;
  const elapsed=Date.now()-started;
  // The whole point: an answer, not a spinner.
  assert.equal(stalled.outcome,'failed');
  assert.equal(stalled.failedStep,'auth','the first phase to touch the dead host is the one that failed');
  assert.equal(stalled.failedStepLabel,'вход','named the way the screen names it');
  assert.equal(stalled.reason,'TIMEOUT');
  assert.equal(stalled.ready,false);
  for(const step of ['auth','testSend','imap','incoming'])
   assert.equal(stalled.checks[step].status,'failed',`${step} must carry an outcome, never none`);
  assert.equal(stalled.checks.testSend.code,'SKIPPED','later phases say they were skipped, not that they failed on their own');
  assert.ok(elapsed<25000,`the check must finish inside its budget, took ${elapsed}ms`);

  // The mailbox exists on the server even though the check failed, which is what the interface
  // has to be able to show: a hung request left it invisible while it was already there.
  const afterStall=(await req('/mailboxes/status')).body;
  const stalledBox=afterStall.domains.flatMap((d:any)=>d.mailboxes).find((m:any)=>m.email==='outreach@stalled.example');
  assert.ok(stalledBox,'the mailbox is created before it is checked, so it must be listed either way');
  assert.equal(stalledBox.connection,'smtp');

  // Re-checking an existing mailbox is bounded the same way, and ends the same way.
  const rechecked=(await req('/mailboxes/verify',{email:'outreach@stalled.example'})).body;
  assert.equal(rechecked.outcome,'failed');
  assert.equal(rechecked.reason,'TIMEOUT');
  assert.equal(rechecked.failedStep,'auth');

  // --- Platform mail state is stated on a screen, not only in the server log ------------------
  const mailStatus=(await req('/platform/mail')).body;
  assert.equal(mailStatus.configured,true);
  assert.deepEqual(mailStatus.required,['SYSTEM_SMTP_HOST','SYSTEM_SMTP_USER','SYSTEM_SMTP_PASS'],
   'the exact variables an operator has to set');
  assert.deepEqual(mailStatus.missing,[]);
  const mailTest=(await req('/platform/mail/test',{})).body;
  assert.equal(mailTest.ok,true,mailTest.detail);
  assert.ok(smtp.inbox.some(m=>m.to==='operator@example.com'),'a real message leaves the platform mailbox');

  // --- What a chat can do without Sendina having a model of its own ---------------------------
  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),
   {requestInit:{headers:{Authorization:'Bearer production-mcp-token'}}}));
  const call=async(name:string,args:any={})=>{
   const r:any=await client.callTool({name,arguments:args});
   assert.ok(!r.isError,`${name}: ${r.content?.[0]?.text}`);
   return r.structuredContent.result;
  };
  const fails=async(name:string,args:any={})=>{
   const r:any=await client.callTool({name,arguments:args});
   assert.ok(r.isError,`${name} was expected to refuse`);
   return String(r.content?.[0]?.text??'');
  };

  // No model is configured in this workspace, so the search Sendina performs itself is refused —
  // correctly, because it is the one that needs one.
  assert.equal((await req('/capabilities')).body.ai.ready,false);
  const campaign=await call('create_campaign',{name:'Исследование из чата',market:'Германия',
   goal:'Продажа услуги',context:'Автоматизация обработки заявок для небольших сервисных компаний',
   event:'Встреча'});
  const refused=await fails('find_recipients',{id:campaign.id,mode:'proposal'});
  assert.match(refused,/propose_recipients/,'and it names the path that does not need a model');

  // The research was done in the chat. Storing it needs no model at all.
  const proposed=await call('propose_recipients',{id:campaign.id,candidates:[
   {name:'Клаус Вебер',company:'Weber Service GmbH',role:'Geschäftsführer',country:'Германия',
    evidence:'На сайте компании указано, что заявки принимаются по телефону и электронной почте.',
    basis:'Опубликованный рабочий контакт организации',
    reason:'Компания принимает заявки вручную и теряет обращения вне рабочих часов.',confidence:70},
   {name:'Мария Шульц',company:'Schulz Technik',role:'Inhaberin',country:'Германия',
    evidence:'В каталоге отрасли компания названа среди сервисных фирм региона.',
    basis:'Опубликованный отраслевой каталог',
    reason:'Небольшая сервисная компания с ручной обработкой входящих обращений.',confidence:60}]});
  assert.equal(proposed.added,2);
  assert.equal(proposed.verified,0,'nothing arrives verified on the sender’s word');

  // The guard the brief insists on keeping: an unconfirmed address cannot be sent to.
  const state=(await req('/state')).body;
  const stored=state.contacts.filter((c:any)=>c.campaignId===campaign.id);
  assert.equal(stored.length,2,'and the interface sees exactly the same rows');
  for(const c of stored){
   assert.equal(c.verification,'unverified');
   assert.equal(c.origin,'proposal');
   assert.ok(c.evidence&&c.basis&&c.reason,'source, basis and reason are kept, not dropped');
  }
  // Asked as the rules would answer once the campaign is running, so the recipient's own problem
  // is the one that shows rather than the campaign still being a draft.
  const blocked=(await req(`/campaigns/${campaign.id}/launch-preview`,{limit:5})).body;
  assert.ok(blocked.sample.every((m:any)=>m.policy.decision==='block'),'an unconfirmed recipient is not sendable');
  assert.ok(blocked.sample.every((m:any)=>m.policy.reason==='SOURCE_UNVERIFIED'),
   JSON.stringify(blocked.sample.map((m:any)=>m.policy.reason)));

  // Confirmation is the same evidenced step it always was, and it is what lifts that block.
  await call('confirm_recipient',{contactId:stored[0].id,email:'weber@weber-service.example',
   source:'https://weber-service.example/kontakt',
   evidence:'На странице контактов указан адрес weber@weber-service.example.'});
  const confirmed=(await req('/state')).body.contacts.find((c:any)=>c.id===stored[0].id);
  assert.equal(confirmed.verification,'verified');
  assert.equal(confirmed.email,'weber@weber-service.example');

  // --- Opportunities and markets researched in the chat land in the screens -------------------
  assert.deepEqual((await call('list_opportunities')).results,[],'nothing is there to begin with');
  const savedOpportunities=await call('save_opportunities',{
   items:[card('Приём заявок без оператора','Германия','Сервисные компании')],
   sources:[{title:'Отраслевой обзор',url:'https://example.com/report'}]});
  assert.equal(savedOpportunities.saved,1);
  const opportunity=savedOpportunities.results[0];
  // The score is computed here from the factors, never taken as a number somebody supplied.
  assert.ok(opportunity.score>0&&opportunity.score<=100);
  assert.ok(opportunity.scoreWhy.includes('Поднимают оценку'),'and it explains itself');
  // The screen reads the same rows, by the same id. This is what stayed empty before.
  const screen=(await req('/opportunities')).body;
  assert.equal(screen.results.length,1);
  assert.equal(screen.results[0].id,opportunity.id);
  assert.equal(screen.results[0].name,'Приём заявок без оператора');

  await call('save_favourite',{id:opportunity.id});
  assert.equal((await req('/opportunities')).body.favourites[0].id,opportunity.id,'the interface sees the favourite');
  assert.equal((await call('list_opportunities')).favourites.length,1,'and so does the chat');

  const test1=await call('create_test_from_research',{id:opportunity.id});
  assert.equal(test1.from.id,opportunity.id);
  assert.ok((await req('/state')).body.campaigns.some((c:any)=>c.id===test1.campaign.id),
   'a campaign built from a chat-saved card is an ordinary campaign');

  await call('remove_favourite',{id:opportunity.id});
  assert.equal((await req('/opportunities')).body.favourites.length,0);

  const savedMarkets=await call('save_market_results',{items:[card('Сервисные компании','Польша','Сервис')]});
  const market=savedMarkets.results[0];
  assert.equal((await req('/markets')).body.results[0].id,market.id,'markets behave identically');
  await call('save_favourite',{id:market.id});
  assert.equal((await call('list_markets')).favourites[0].id,market.id);
  const test2=await call('create_test_from_research',{id:market.id});
  assert.equal(test2.from.kind,'market');

  // --- What a connector must be able to read before any live send ----------------------------
  const sender=await call('get_sender_status');
  assert.equal(sender.sendingEnabled,false,'sending is not built, and this says so plainly');
  assert.equal(sender.ready,false);
  assert.ok(sender.blockers.length>0,'and lists what is in the way');
  const seen=sender.mailboxes.find((m:any)=>m.email==='outreach@stalled.example');
  assert.ok(seen,'every connected mailbox is visible');
  // The last outcome of all four checks, which is what decides whether a real send may happen.
  assert.equal(seen.checks.auth.status,'failed');
  assert.equal(seen.checks.auth.code,'TIMEOUT');
  assert.equal(seen.checks.auth.step,'вход');
  assert.equal(seen.readiness.ready,false);

  // --- A chat and the interface answer the same question with the same numbers ---------------
  const uiAnalytics=(await req('/analytics',{period:'30d',campaign:'all'})).body;
  const mcpAnalytics=await call('get_analytics',{period:'30d',campaign:'all'});
  // The window is measured from the moment it is asked for, so the two calls name two instants a
  // few milliseconds apart. Everything the window is used to count has to agree exactly.
  const {period:uiPeriod,previous:uiPrevious,...uiRest}=uiAnalytics;
  const {period:mcpPeriod,previous:mcpPrevious,...mcpRest}=mcpAnalytics;
  assert.deepEqual(mcpRest,uiRest,'analytics must not disagree between the two');
  assert.equal(mcpPeriod.id,uiPeriod.id);
  assert.ok(Math.abs(
   (Date.parse(mcpPeriod.to)-Date.parse(mcpPeriod.from))-(Date.parse(uiPeriod.to)-Date.parse(uiPeriod.from)))<1000,
   'and cover a window of the same length');
  assert.ok(Math.abs(Date.parse(mcpPrevious.from)-Date.parse(uiPrevious.from))<1000,
   'and the same preceding window to compare against');
  const uiThreads=(await req('/threads')).body;
  const mcpThreads=await call('list_threads');
  assert.deepEqual(mcpThreads,uiThreads);
  const noThread=await fails('get_thread',{email:'nobody@example.com'});
  assert.match(noThread,/Переписки/,'and an absent conversation is said to be absent, not invented');
 }finally{await client.close().catch(()=>{});child.kill();smtp.server.close();hole.server.close();}
});
