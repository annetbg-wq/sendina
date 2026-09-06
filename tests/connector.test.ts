import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {smtpStub} from './smtpstub';
import {signIn,platformEnv} from './session';
import {infrastructure} from './product/stubs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Ports: API 3110, model/search stub 3190, SMTP 3189. See tests/session.ts for the whole map.

/** The connector and the interface are the same product.

    This is the scenario from the brief, run for real: a person asks ChatGPT for six
    opportunities, keeps the third, and creates a test from it — and every step is visible in the
    workspace the screens read. If MCP ever grew a store of its own, this test would fail. */
test('what a chat does through MCP is what the interface shows, with the same ids',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-connector-'));
 const smtp=smtpStub(3189);
 await smtp.listen();
 const stub=infrastructure(3190);
 await new Promise<void>(r=>stub.listen(3190,'127.0.0.1',r));
 const base='http://127.0.0.1:3110';
 const child=spawn(process.execPath,['--import','tsx',resolve('server/index.ts')],{env:{...process.env,
  PORT:'3110',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'connector-secret',
  MCP_TOKEN:'connector-mcp-token',MCP_ACCOUNT_EMAIL:'operator@example.com',
  OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',PUBLIC_URL:base,APP_URL:base,
  SEARCH_BASE_URL:'http://127.0.0.1:3190/search',
  ...platformEnv(3189,'operator@example.com')},stdio:'pipe'});
 let logs='';child.stderr.on('data',d=>logs+=d);child.stdout.on('data',d=>logs+=d);
 const client=new Client({name:'sendina-connector-test',version:'1.0'});
 let token='';
 const req=async(path:string,body?:unknown)=>{
  const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
   body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 };
 try{
  let ready=false;
  for(let i=0;i<100;i++){try{await fetch(base+'/api/health');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(ready,logs);
  token=await signIn(base,smtp,'operator@example.com');
  // The platform supplies the model and the search, so nobody is asked for a key.
  assert.equal((await req('/platform',{openaiKey:'connector-test-key',openaiModel:'stub',
   aiGatewayUrl:'http://127.0.0.1:3190',searchProvider:'serper',searchKey:'connector-search'})).status,200);

  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),
   {requestInit:{headers:{Authorization:'Bearer connector-mcp-token'}}}));
  const call=async(name:string,args:any={})=>{
   const r:any=await client.callTool({name,arguments:args});
   assert.ok(!r.isError,`${name}: ${r.content?.[0]?.text}`);
   return r.structuredContent.result;
  };

  // "Найди 6 возможностей для малого бизнеса Нью-Йорка на текущий момент."
  const found=await call('research_opportunities',
   {location:{countries:['США'],city:'Нью-Йорк'},industry:'малый бизнес'});
  assert.equal(found.results.length,6,'the connector returns exactly six');
  for(const item of found.results){
   assert.ok(item.score>=0&&item.score<=100,'each card carries a 0–100 score');
   assert.ok(item.researchedAt,'each card carries the time it was researched');
   assert.ok(item.whyNow&&item.whyHere&&item.ticket,'each card answers why now, why here, and for how much');
  }

  // The screen reads the same six, by id, without asking MCP anything.
  const screen=(await req('/opportunities')).body;
  assert.deepEqual(screen.results.map((o:any)=>o.id),found.results.map((o:any)=>o.id),
   'the interface shows exactly the rows the connector produced');

  // "Добавь третью в избранное."
  const third=found.results[2];
  await call('save_favourite',{id:third.id});
  const kept=(await req('/opportunities')).body;
  assert.equal(kept.favourites.length,1);
  assert.equal(kept.favourites[0].id,third.id,'the favourite the chat kept is the one the screen lists');

  // A new search replaces the six and leaves the favourite alone.
  const again=await call('research_opportunities',{location:{countries:['Германия']},industry:'логистика'});
  assert.equal(again.results.length,6);
  const afterSecond=(await req('/opportunities')).body;
  assert.equal(afterSecond.favourites.length,1,'a new search never drops what was kept');
  assert.notDeepEqual(afterSecond.results.map((o:any)=>o.id),found.results.map((o:any)=>o.id),
   'a new search replaces the previous results rather than adding to them');

  // "Создай по ней тест." — an ordinary campaign, in the workspace the screens read.
  const made=await call('create_test_from_research',{id:third.id});
  const state=(await req('/state')).body;
  const campaign=state.campaigns.find((c:any)=>c.id===made.campaign.id);
  assert.ok(campaign,'the campaign created from a chat is in the workspace');
  assert.equal(campaign.name,third.name);
  assert.equal(campaign.status,'draft','nothing is sent because a chat asked for it');
  assert.equal(campaign.control,'confirm');

  // Market research from a chat lands on the same screen too.
  const byCountry=await call('research_markets_by_country',{location:{countries:['Германия']}});
  assert.equal(byCountry.results.length,6);
  const byNiche=await call('research_markets_by_niche',{niche:'автоматизация записи для клиник'});
  assert.equal(byNiche.results.length,6);
  const assessed=await call('assess_market',{location:{countries:['Германия']},niche:'автоматизация записи для клиник'});
  assert.equal(assessed.results.length,1,'naming both asks only for a verdict on that pair');
  assert.deepEqual((await req('/markets')).body.results.map((o:any)=>o.id),assessed.results.map((o:any)=>o.id));

  // A conversation and its analytics read the same rows the screens do.
  await req(`/campaigns/${campaign.id}/contacts`,{contacts:[{email:'anna@clinic.example',name:'Анна',
   company:'Clinic',source:'https://clinic.example/contact',basis:'Опубликованный рабочий контакт',
   reason:'Клиника ищет способ не терять заявки'}]});
  await req(`/campaigns/${campaign.id}/preview`,{limit:5});
  await req('/replies',{campaignId:campaign.id,email:'anna@clinic.example',text:'Давайте встретимся',
   category:'positive',eventId:'connector-reply-1'});
  const thread=await call('get_thread',{email:'anna@clinic.example'});
  assert.equal(thread.entries.length,2,'the chat sees the outgoing letter and the reply');
  assert.equal(thread.entries[0].direction,'outgoing');
  assert.equal(thread.entries[1].direction,'incoming');
  assert.equal(thread.category,'positive');
  const analytics=await call('get_analytics',{period:'30d',campaign:'all'});
  assert.equal(analytics.totals.replies,1);
  assert.equal(analytics.totals.positive,1);
  assert.deepEqual(analytics.totals,(await req('/analytics',{period:'30d',campaign:'all'})).body.totals,
   'the chat and the screen compute the same numbers');

  // Excluding from a chat is the same global exclusion the interface uses.
  await call('exclude_recipient',{email:'anna@clinic.example'});
  assert.ok((await req('/state')).body.suppressed.includes('anna@clinic.example'));
 }finally{await client.close();child.kill();smtp.server.close();stub.close();}
});
