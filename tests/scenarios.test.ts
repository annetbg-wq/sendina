import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {smtpStub} from './smtpstub';
import {signIn,platformEnv} from './session';

/** Two real organisations with public sites, one of which publishes a contact address. */
const places={places:[
 {displayName:{text:'Harbour Hotel'},websiteUri:'https://harbour.example',formattedAddress:'1 Dock Road, Brighton, United Kingdom',rating:4.4},
 {displayName:{text:'Riverside Rooms'},websiteUri:'https://riverside.example',formattedAddress:'8 Mill Lane, Bath, United Kingdom',rating:4.1},
 {displayName:{text:'No Site Guesthouse'},websiteUri:'',formattedAddress:'Nowhere',rating:3.9}
]};
const hits=[
 {title:'Harbour Hotel — contact',link:'https://harbour.example/contact',snippet:'Reservations manager Maria Lang, write to bookings@harbour.example about booking integrations.'},
 {title:'Riverside Rooms — team',link:'https://riverside.example/team',snippet:'Riverside Rooms is looking for booking automation partners.'}
];
/** The model answers honestly once, invents an address once, and invents a source once. */
const candidates={candidates:[
 {name:'Maria Lang',company:'Harbour Hotel',role:'Reservations manager',country:'United Kingdom',
  sourceUrl:'https://harbour.example/contact',email:'bookings@harbour.example',
  evidence:'write to bookings@harbour.example about booking integrations',
  reason:'Они просят писать по вопросам интеграции бронирования',basis:'Опубликованный рабочий контакт',confidence:82},
 {name:'Owner',company:'Riverside Rooms',role:'Owner',country:'United Kingdom',
  sourceUrl:'https://riverside.example/team',email:'owner@riverside.example',
  evidence:'looking for booking automation partners',
  reason:'Они публично ищут партнёров по автоматизации бронирования',basis:'Опубликованный рабочий контакт',confidence:64},
 {name:'Ghost',company:'Nowhere Ltd',role:'Director',country:'United Kingdom',
  sourceUrl:'https://invented.example/made-up',email:'ghost@invented.example',evidence:'invented',
  reason:'Полностью выдуманный кандидат со ссылкой, которой не было в выдаче',basis:'Нет',confidence:99}
]};

/** One stub for the model, the web search and the organisation search. */
function infrastructure(){
 const server=createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);
  req.on('end',()=>{
   res.setHeader('Content-Type','application/json');
   if(req.url==='/search')return res.end(JSON.stringify({organic:hits}));
   if(req.url?.includes('places:searchText'))return res.end(JSON.stringify(places));
   const asked=JSON.stringify(JSON.parse(body||'{}'));
   const answer=asked.includes('запросы для поиска организаций')
    ?{profile:'Небольшие отели, которые автоматизируют бронирование',queries:['boutique hotels brighton'],roles:['менеджер по бронированию']}
    :asked.includes('Оцени соответствие')
    ?{organisations:[{name:'Harbour Hotel',fit:90,why:'Небольшой отель с онлайн-бронированием'},
      {name:'Riverside Rooms',fit:70,why:'Публично ищет партнёров'}]}
    :asked.includes('выбираешь страну или регион')
    ?{market:'Великобритания',why:'Продукт описан для небольших отелей, а найденные организации находятся там.'}
    :candidates;
   res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}));
  });
 });
 return server;
}

test('three ways in, one core: guided research, own contacts, and the manual path',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-scenarios-'));
 const stub=infrastructure();
 await new Promise<void>(r=>stub.listen(3193,'127.0.0.1',r));
 const smtp=smtpStub(3192);
 await smtp.listen();
 const base='http://127.0.0.1:3108';
 const child=spawn(process.execPath,['--import','tsx',resolve('server/index.ts')],{stdio:'pipe',env:{...process.env,
  PORT:'3108',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'platform-secret',MCP_TOKEN:'scenario-mcp-token',MCP_ACCOUNT_EMAIL:'boss@example.com',OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',
  PUBLIC_URL:base,APP_URL:base,ENCRYPTION_KEY:'scenario-key',
  SEARCH_BASE_URL:'http://127.0.0.1:3193/search',
  PLACES_BASE_URL:'http://127.0.0.1:3193',
  ...platformEnv(3192,'boss@example.com')}});
 let logs='';child.stderr.on('data',d=>logs+=d);child.stdout.on('data',d=>logs+=d);
 let token='';
 const req=async(path:string,body?:unknown)=>{
  const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
   body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 };
 const client=new Client({name:'sendina-scenarios',version:'1.0'});
 try{
  for(let i=0;i<100;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal((await fetch(base+'/api/health')).status,200,logs);
  token=await signIn(base,smtp,'boss@example.com');

  // The administrator supplies the infrastructure once, for everyone.
  await req('/platform',{openaiKey:'platform-model-key',aiGatewayUrl:'http://127.0.0.1:3193',
   searchProvider:'serper',searchKey:'platform-search-key',
   placesProvider:'google',placesKey:'platform-places-key'});
  const caps=(await req('/capabilities')).body;
  assert.equal(caps.provided.model,'platform','an ordinary person is never asked for a model key');
  assert.equal(caps.provided.organisations,'platform');
  assert.equal(caps.recipients.effective,'organisations','the strongest evidence available is used');
  assert.equal(caps.connections.openai.configured,false,'nothing was stored on the account itself');

  // --- A. A new user with no list at all ---
  const recommended=(await req('/recommend-market',
   {context:'Автоматизация брони для небольших отелей. Заявки теряются.',goal:'Продажа услуги'})).body;
   assert.equal(recommended.market,'Великобритания','the market is recommended, not silently defaulted');
  assert.ok(recommended.why.length>10);

  const auto=(await req('/campaigns',{name:'Автоматизация брони для небольших отелей',market:recommended.market,
   goal:'Продажа услуги',context:'Автоматизация брони. Решаемая проблема: заявки теряются',event:'Встреча'})).body;
  assert.equal(auto.control,'confirm','a new campaign asks to approve the first batch by default');

  const found=(await req(`/campaigns/${auto.id}/find`,{count:20})).body;
  assert.equal(found.mode,'organisations');
  assert.equal(found.added,2,'the candidate citing a source no search returned is dropped');
  assert.equal(found.verified,1,'only the address present in its source counts as verified');

  const preview=(await req(`/campaigns/${auto.id}/launch-preview`,{limit:5})).body;
  assert.equal(preview.recipients,2);
  assert.equal(preview.verified,1);
  const shown=preview.sample.find((m:any)=>m.email==='bookings@harbour.example');
  assert.ok(shown,'the reviewed sample names the real recipient');
  assert.equal(shown.company,'Harbour Hotel');
  assert.equal(shown.role,'Reservations manager');
  assert.equal(shown.source,'https://harbour.example/contact');
  assert.ok(shown.evidence.length>5,'the sample carries the evidence behind the choice');
  assert.ok(shown.text.includes(shown.reason),'and the letter that recipient would receive');
  // Until the operator approves, the rules hold everything back.
  assert.equal(shown.policy.reason,'FIRST_BATCH_APPROVAL_REQUIRED');
  const unverified=preview.sample.find((m:any)=>m.verification==='unverified');
  assert.equal(unverified.policy.reason,'SOURCE_UNVERIFIED','a review still sees the recipient\'s own problems');

  await req(`/campaigns/${auto.id}/approve`,{});
  await req(`/campaigns/${auto.id}/status`,{status:'active'});
  const approved=(await req(`/campaigns/${auto.id}/launch-preview`,{limit:5})).body;
  const nowAllowed=approved.sample.find((m:any)=>m.email==='bookings@harbour.example');
  // Approval lifts only its own gate; the sender is still not connected.
  assert.equal(nowAllowed.policy.reason,'DOMAIN_UNVERIFIED');

  // --- B. A user who brings their own list ---
  const own=(await req('/campaigns',{name:'Своя база адресатов',market:'Великобритания',goal:'Партнёрство',
   context:'Тот же продукт для собственного списка контактов',event:'Встреча'})).body;
  assert.equal((await req(`/campaigns/${own.id}/contacts`,{contacts:[
   {email:'partner@known.example',name:'Известный партнёр',company:'Known Ltd',
    source:'https://known.example/contact',basis:'Опубликованный рабочий контакт',
    reason:'Мы уже обсуждали интеграцию на конференции'},
   {email:'nobody@known.example',name:'Без причины',company:'Known Ltd',
    source:'https://known.example/contact',basis:'Опубликованный рабочий контакт',
    reason:'Причина есть для проверки длины'}]})).body.added,2);
  const ownPreview=(await req(`/campaigns/${own.id}/launch-preview`,{limit:5})).body;
  assert.equal(ownPreview.recipients,2);
  assert.equal(ownPreview.verified,2,'imported recipients arrive with their own documented source');
  assert.equal(ownPreview.sample.length,2,'the same preview, personalisation and rules as the guided path');
  assert.equal(ownPreview.sample[0].policy.reason,'FIRST_BATCH_APPROVAL_REQUIRED');
  assert.ok(ownPreview.sample[0].text.includes(ownPreview.sample[0].reason));

  // --- C. The manual path keeps every existing control ---
  const manual=(await req('/campaigns',{name:'Ручной режим',market:'США',goal:'Обращение',
   context:'Кампания, которой оператор управляет по шагам',event:'Получение документа',control:'manual'})).body;
  assert.equal(manual.control,'manual');
  await req(`/campaigns/${manual.id}/contacts`,{contacts:[{email:'office@authority.example',name:'Канцелярия',
   company:'Authority',source:'https://authority.example/contact',basis:'Публичный приём обращений',
   reason:'Запрос документа по опубликованной процедуре'}]});
  await req(`/campaigns/${manual.id}/status`,{status:'active'});
  const manualPreview=(await req(`/campaigns/${manual.id}/launch-preview`,{limit:5})).body;
  assert.equal(manualPreview.sample[0].policy.reason,'MANUAL_APPROVAL_REQUIRED','nothing leaves without a hand on it');
  assert.equal((await req(`/campaigns/${manual.id}/approve`,{})).status,422,
   'approving a batch makes no sense in the fully manual mode');
  // The detailed research modes are still reachable for an operator who wants them.
  assert.equal((await req('/settings/recipients',{mode:'search'})).body.effective,'search');
  assert.equal((await req('/settings/recipients',{mode:'auto'})).body.effective,'organisations');

  // --- All three campaigns are one and the same kind of thing, and MCP sees them ---
  const state=(await req('/state')).body;
  const mine=[auto.id,own.id,manual.id];
  for(const id of mine){
   const campaign=state.campaigns.find((c:any)=>c.id===id);
   assert.ok(campaign,'every entry point produces an ordinary campaign');
   for(const field of ['name','market','goal','context','event','status','control','firstBatchApprovedAt'])
    assert.ok(field in campaign,`a campaign from any path carries ${field}`);
  }
  assert.equal(new Set(state.contacts.map((c:any)=>c.campaignId)).size,3,'one recipient store, partitioned by campaign');
  assert.ok(state.audit.some((a:any)=>a.action.includes('Первая партия')),'approvals are written to the activity log');

  const connector=(await req('/settings/connector')).body.code;
  assert.ok(connector);
  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),
   {requestInit:{headers:{Authorization:'Bearer scenario-mcp-token'}}}));
  const call=async(name:string,args:any={})=>{
   const r:any=await client.callTool({name,arguments:args});
   assert.ok(!r.isError,`${name}: ${r.content?.[0]?.text}`);
   return r.structuredContent.result;
  };
  const listed=await call('list_campaigns');
  for(const id of mine)assert.ok(listed.some((c:any)=>c.id===id),'MCP sees campaigns from every entry point');
  const throughMcp=await call('launch_preview',{id:auto.id,limit:5});
  assert.equal(throughMcp.recipients,2,'and the same recipients behind them');
  assert.equal(throughMcp.campaign.control,'confirm');

  // An action taken over MCP shows up in the interface, because there is one core.
  await call('set_control_mode',{id:own.id,control:'manual'});
  assert.equal((await req('/state')).body.campaigns.find((c:any)=>c.id===own.id).control,'manual');
  const afterMcp=(await req(`/campaigns/${own.id}/launch-preview`,{limit:5})).body;
  assert.equal(afterMcp.sample[0].policy.reason,'MANUAL_APPROVAL_REQUIRED');
 }finally{await client.close().catch(()=>{});child.kill();stub.close();smtp.server.close();}
});
