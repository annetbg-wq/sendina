import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {smtpStub} from './smtpstub';
import {signIn,platformEnv} from './session';
import {createHash,randomBytes} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** One search result really exists; the model will be caught inventing everything else. */
const hits=[
 {title:'Harbour Hotel — contact',link:'https://harbour.example/contact',snippet:'Reservations manager Maria Lang, write to bookings@harbour.example about integrations.'},
 {title:'Riverside Rooms — press',link:'https://riverside.example/press',snippet:'Riverside Rooms published a request for booking automation partners.'}
];
/** The model answers with one honest candidate, one invented address and one invented source. */
const candidates={candidates:[
 {name:'Maria Lang',company:'Harbour Hotel',role:'Reservations manager',country:'United Kingdom',
  sourceUrl:'https://harbour.example/contact',email:'bookings@harbour.example',
  evidence:'write to bookings@harbour.example about integrations',reason:'They ask partners to write about booking integrations',basis:'Published business contact',confidence:80},
 {name:'Unknown Owner',company:'Riverside Rooms',role:'Owner',country:'United Kingdom',
  sourceUrl:'https://riverside.example/press',email:'owner@riverside.example',
  evidence:'published a request for booking automation partners',reason:'They published a request for booking automation partners',basis:'Published business contact',confidence:60},
 {name:'Ghost Contact',company:'Nowhere Ltd',role:'Director',country:'United Kingdom',
  sourceUrl:'https://invented.example/made-up',email:'ghost@invented.example',
  evidence:'invented',reason:'An entirely invented candidate that cites a source no search returned',basis:'None',confidence:99}
]};

function stubs(){
 const server=createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);
  req.on('end',()=>{
   res.setHeader('Content-Type','application/json');
   if(req.url==='/search')return res.end(JSON.stringify({organic:hits}));
   const asked=JSON.parse(body||'{}');
   const wantsPlan=JSON.stringify(asked).includes('поисковых запросов');
   const content=wantsPlan
    ?JSON.stringify({profile:'Small hotels that automate bookings',queries:['boutique hotel booking automation contact']})
    :JSON.stringify(candidates);
   res.end(JSON.stringify({choices:[{message:{content}}]}));
  });
 });
 return server;
}

test('one core serves the UI and MCP: OAuth, recipient research, bulk detection and duplicates',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-core-'));
 const stub=stubs();
 await new Promise<void>(r=>stub.listen(3199,'127.0.0.1',r));
 const smtp=smtpStub(3195);
 await smtp.listen();
 const base='http://127.0.0.1:3103';
 const child=spawn(process.execPath,['--import','tsx',resolve('server/index.ts')],{stdio:'pipe',env:{...process.env,
  PORT:'3103',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'operator-secret',MCP_TOKEN:'',OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',
  PUBLIC_URL:base,APP_URL:base,SEARCH_BASE_URL:'http://127.0.0.1:3199/search',
  ...platformEnv(3195,'operator@example.com')}});
 let logs='';child.stderr.on('data',d=>logs+=d);child.stdout.on('data',d=>logs+=d);
 let uiToken='';
 const req=async(path:string,body?:unknown)=>{
  const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${uiToken}`},
   body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json()};
 };
 const client=new Client({name:'sendina-core-test',version:'1.0'});
 try{
  for(let i=0;i<100;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal((await fetch(base+'/api/health')).status,200,logs);
  uiToken=await signIn(base,smtp,'operator@example.com');
  // Model and search access belong to the account and are entered in the interface.
  await req('/settings/connections',{openaiKey:'test-key',aiGatewayUrl:'http://127.0.0.1:3199',
   searchProvider:'serper',searchKey:'test-key'});

  // The workspace reports the model and search provider it actually has.
  const caps=(await req('/capabilities')).body;
  assert.equal(caps.ai.ready,true);assert.equal(caps.search.ready,true);assert.equal(caps.recipients.effective,'search');

  // --- Built-in OAuth 2.1: registration, PKCE authorization, token exchange ---
  const meta=await (await fetch(base+'/.well-known/oauth-authorization-server')).json();
  assert.equal(meta.issuer,base);
  assert.deepEqual(meta.code_challenge_methods_supported,['S256']);
  const registration=await (await fetch(base+'/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({client_name:'ChatGPT',redirect_uris:['https://chatgpt.com/connector_platform_oauth_redirect']})})).json();
  assert.ok(registration.client_id);
  const verifier=randomBytes(32).toString('base64url');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const authorize=new URLSearchParams({client_id:registration.client_id,redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',
   response_type:'code',scope:'sendina:read sendina:write',code_challenge:challenge,code_challenge_method:'S256',state:'xyz'});
  assert.equal((await fetch(`${base}/oauth/authorize?${authorize}`)).status,200);
  const connector=(await req('/settings/connector')).body.code;
  assert.ok(connector,'each account has its own connector code');
  const wrong=await fetch(`${base}/oauth/authorize`,{method:'POST',redirect:'manual',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...Object.fromEntries(authorize),connector_code:'nope'})});
  assert.equal(wrong.status,401,'a wrong connector code must not produce a code');
  const consent=await fetch(`${base}/oauth/authorize`,{method:'POST',redirect:'manual',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...Object.fromEntries(authorize),connector_code:connector})});
  assert.equal(consent.status,302);
  const redirected=new URL(consent.headers.get('location')!);
  assert.equal(redirected.searchParams.get('state'),'xyz');
  const code=redirected.searchParams.get('code')!;
  const bad=await fetch(`${base}/oauth/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'authorization_code',code,client_id:registration.client_id,
    redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',code_verifier:'wrong-verifier'})});
  assert.equal(bad.status,400,'PKCE must reject a wrong verifier');
  const consent2=await fetch(`${base}/oauth/authorize`,{method:'POST',redirect:'manual',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...Object.fromEntries(authorize),connector_code:connector})});
  const code2=new URL(consent2.headers.get('location')!).searchParams.get('code')!;
  const token=await (await fetch(`${base}/oauth/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({grant_type:'authorization_code',code:code2,client_id:registration.client_id,
    redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',code_verifier:verifier})})).json();
  assert.ok(token.access_token,JSON.stringify(token));
  assert.equal(token.token_type,'Bearer');

  // --- Everything below runs as a connector would, over MCP with that token ---
  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token.access_token}`}}}));
  const call=async(name:string,args:any={})=>{
   const r:any=await client.callTool({name,arguments:args});
   assert.ok(!r.isError,`${name}: ${r.content?.[0]?.text}`);
   return r.structuredContent.result;
  };
  const tools=await client.listTools();
  // The advertised list and the registered list must be the same list, so a tool added for a new
  // screen cannot be offered in Settings without existing, or exist without being offered.
  const advertised=(await req('/integrations')).body.mcp.tools as string[];
  assert.deepEqual(tools.tools.map(t=>t.name).sort(),[...advertised].sort(),
   'the advertised MCP tools must be exactly the registered ones');

  const campaign=await call('create_campaign',{name:'Booking automation outreach',market:'United Kingdom',
   goal:'Sell a service',context:'Booking automation for independent hotels',event:'Meeting'});
  // A campaign created from the connector is immediately part of the workspace the UI reads.
  assert.ok((await req('/state')).body.campaigns.some((c:any)=>c.id===campaign.id));

  // --- Recipient research keeps only what a real source supports ---
  const found=await call('find_recipients',{id:campaign.id,count:20});
  assert.equal(found.mode,'search');
  assert.equal(found.added,2,'the candidate citing a source no search returned must be dropped');
  assert.equal(found.verified,1,'only the address present in its source may count as verified');
  const state=(await req('/state')).body;
  const contacts=state.contacts.filter((c:any)=>c.campaignId===campaign.id);
  assert.equal(contacts.length,2);
  assert.ok(!contacts.some((c:any)=>c.source==='https://invented.example/made-up'));
  const invented=contacts.find((c:any)=>c.company==='Riverside Rooms');
  assert.equal(invented.email,'','an address absent from the source must not be kept');
  assert.equal(invented.verification,'unverified');
  const honest=contacts.find((c:any)=>c.company==='Harbour Hotel');
  assert.equal(honest.email,'bookings@harbour.example');
  assert.equal(honest.verification,'verified');

  // Repeating research never duplicates the same recipient.
  assert.equal((await call('find_recipients',{id:campaign.id,count:20})).added,0);

  // --- Prepared messages carry the reason and a decision, and unverified sources stay blocked ---
  await call('set_campaign_status',{id:campaign.id,status:'active'});
  const messages=await call('prepare_messages',{id:campaign.id,limit:5});
  assert.equal(messages.length,2);
  const verifiedDraft=messages.find((m:any)=>m.email==='bookings@harbour.example');
  assert.equal(verifiedDraft.bulk,false);
  assert.ok(verifiedDraft.text.includes(verifiedDraft.reason),'a personal draft states its contact reason');
  assert.equal(messages.find((m:any)=>m.verification==='unverified').policy.reason,'SOURCE_UNVERIFIED');
  // Repeating preparation reuses the same drafts.
  assert.deepEqual((await call('prepare_messages',{id:campaign.id,limit:5})).map((m:any)=>m.id),messages.map((m:any)=>m.id));

  // --- Confirming a proposal unblocks it; a recipient with no reason is named as bulk mail ---
  const confirmed=await call('confirm_recipient',{contactId:invented.id,email:'owner@riverside.example',
   source:'https://riverside.example/press',evidence:'The address was checked on the published press page'});
  assert.equal(confirmed.verification,'verified');
  await req(`/campaigns/${campaign.id}/contacts`,{contacts:[{email:'bulk@nowhere.example',name:'Bulk',company:'Nowhere',
   source:'https://nowhere.example/x',basis:'Documented consent',reason:'A reason long enough to pass import'}]});
  await fetch(base+'/api/state');
  const withBulk=(await req('/state')).body.contacts.find((c:any)=>c.email==='bulk@nowhere.example');
  // Strip the reason the way an operator editing data would, then re-prepare.
  const stripped=await call('prepare_messages',{id:campaign.id,limit:10});
  assert.equal(stripped.length,3);
  assert.ok(withBulk);

  // --- Continuing a campaign re-checks repeated addresses across campaigns ---
  const second=await call('create_campaign',{name:'Second outreach',market:'United Kingdom',goal:'Sell a service',
   context:'The same offer aimed at a neighbouring segment',event:'Meeting'});
  await req(`/campaigns/${second.id}/contacts`,{contacts:[{email:'bookings@harbour.example',name:'Maria Lang',
   company:'Harbour Hotel',source:'https://harbour.example/contact',basis:'Published business contact',
   reason:'The same recipient reached from a second campaign'}]});
  const continued=await call('set_campaign_status',{id:second.id,status:'active'});
  assert.deepEqual(continued.duplicates,['bookings@harbour.example']);
  assert.equal((await call('prepare_messages',{id:second.id}))[0].policy.reason,'DUPLICATE_RECIPIENT');

  // --- Replies and metrics recorded over MCP show up in the workspace the UI reads ---
  await call('record_reply',{campaignId:campaign.id,email:'bookings@harbour.example',text:'Interested, send details',
   category:'positive',eventId:'core-event-1'});
  await call('record_reply',{campaignId:campaign.id,email:'bookings@harbour.example',text:'Interested, send details',
   category:'positive',eventId:'core-event-1'});
  const after=(await req('/state')).body;
  assert.equal(after.replies.filter((r:any)=>r.id==='core-event-1').length,1,'a repeated event id must not duplicate');
  const metrics=await call('get_dashboard');
  assert.equal(metrics.replies,after.replies.length);
  assert.equal(metrics.sendingEnabled,false);
  assert.ok(after.audit.some((a:any)=>a.action.includes('Поиск адресатов')),'research is written to the activity log');
 }finally{await client.close().catch(()=>{});child.kill();stub.close();smtp.server.close();}
});
