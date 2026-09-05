import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {smtpStub,messageText} from './smtpstub';

const base='http://127.0.0.1:3106';
const call=async(path:string,body?:unknown,token?:string)=>{
 const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',
  headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
  body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,body:await r.json()};
};

test('accounts are separate, superadmins approve, and nobody reads another workspace',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-accounts-'));
 const smtp=smtpStub(3197);
 await smtp.listen();
 const child=spawn(process.execPath,['--import','tsx',resolve('server/index.ts')],{stdio:'pipe',env:{...process.env,
  PORT:'3106',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'platform-secret',MCP_TOKEN:'',OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',
  PUBLIC_URL:base,APP_URL:base,SUPERADMINS:'boss@example.com',
  SYSTEM_SMTP_HOST:'127.0.0.1',SYSTEM_SMTP_PORT:'3197',SYSTEM_SMTP_USER:'platform@example.com',
  SYSTEM_SMTP_PASS:'stub',SYSTEM_MAIL_FROM:'platform@example.com'}});
 let logs='';child.stderr.on('data',d=>logs+=d);child.stdout.on('data',d=>logs+=d);
 /** The link travels by email only; the response body never carries it. */
 const signIn=async(email:string)=>{
  const asked=await call('/auth/request',{email});
  assert.equal(asked.body.status,'sent',JSON.stringify(asked.body));
  assert.ok(!JSON.stringify(asked.body).includes('token='),'a login link must not travel in the response');
  const delivered=smtp.inbox.filter(m=>m.to===email.toLowerCase()).pop();
  assert.ok(delivered,`no mail delivered to ${email}`);
  const link=messageText(delivered!.body).match(/(https?:\/\/\S*auth\/callback\S*)/)?.[1];
  assert.ok(link,`no login link in the mail to ${email}`);
  const redirected=await fetch(link!,{redirect:'manual'});
  assert.equal(redirected.status,302);
  const session=new URL(redirected.headers.get('location')!).hash.match(/session=([^&]+)/)?.[1];
  assert.ok(session,'the callback must hand back a session');
  return decodeURIComponent(session!);
 };
 try{
  for(let i=0;i<100;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.equal((await fetch(base+'/api/health')).status,200,logs);

  // Nothing is reachable without a session.
  assert.equal((await call('/state')).status,401);
  assert.equal((await call('/state',undefined,'not-a-session')).status,401);

  // A listed superadmin is approved on sight and can sign in at once.
  const bossSession=await signIn('boss@example.com');
  const boss=(await call('/auth/session',undefined,bossSession)).body;
  assert.equal(boss.role,'superadmin');
  assert.equal(boss.status,'approved');

  // Anyone else waits for a decision and cannot sign in meanwhile.
  const asked=await call('/auth/request',{email:'newcomer@example.com'});
  assert.equal(asked.body.status,'pending');
  assert.equal((await call('/auth/request',{email:'newcomer@example.com'})).body.status,'pending','still pending on a repeat');

  // Only a superadmin sees the list or decides.
  assert.equal((await call('/accounts',undefined,'')).status,401);
  const listed=(await call('/accounts',undefined,bossSession)).body;
  const newcomer=listed.find((a:any)=>a.email==='newcomer@example.com');
  assert.equal(newcomer.status,'pending');
  assert.equal(newcomer.role,'user');

  await call('/accounts/decide',{id:newcomer.id,status:'approved'},bossSession);
  const userSession=await signIn('newcomer@example.com');
  assert.equal((await call('/auth/session',undefined,userSession)).body.role,'user');
  assert.equal((await call('/accounts',undefined,userSession)).status,403,'a user must not manage accounts');
  assert.equal((await call('/accounts/decide',{id:newcomer.id,status:'blocked'},userSession)).status,403);

  // --- Each account works in its own workspace ---
  const mine=await call('/campaigns',{name:'Boss campaign',market:'США',goal:'Продажа',
   context:'Контекст кампании суперадмина',event:'Встреча'},bossSession);
  const theirs=await call('/campaigns',{name:'Newcomer campaign',market:'Германия',goal:'Партнёрство',
   context:'Контекст кампании пользователя',event:'Встреча'},userSession);
  const bossState=(await call('/state',undefined,bossSession)).body;
  const userState=(await call('/state',undefined,userSession)).body;
  assert.ok(bossState.campaigns.some((c:any)=>c.id===mine.body.id));
  assert.ok(!bossState.campaigns.some((c:any)=>c.id===theirs.body.id),'a superadmin must not see another workspace');
  assert.ok(userState.campaigns.some((c:any)=>c.id===theirs.body.id));
  assert.ok(!userState.campaigns.some((c:any)=>c.id===mine.body.id));

  // Settings are per account, and a saved secret never comes back.
  await call('/settings/connections',{openaiKey:'sk-boss-secret',openaiModel:'gpt-4.1'},bossSession);
  const bossConnections=(await call('/settings/connections',undefined,bossSession)).body;
  assert.equal(bossConnections.openai.configured,true);
  assert.equal(bossConnections.openai.model,'gpt-4.1');
  assert.ok(!JSON.stringify(bossConnections).includes('sk-boss-secret'),'a key must never be returned');
  assert.equal((await call('/settings/connections',undefined,userSession)).body.openai.configured,false,
   'one account must not inherit another account key');

  // Each account gets its own connector code for MCP.
  const bossCode=(await call('/settings/connector',undefined,bossSession)).body.code;
  const userCode=(await call('/settings/connector',undefined,userSession)).body.code;
  assert.notEqual(bossCode,userCode);

  // Blocking ends access immediately, and a login attempt is refused rather than queued.
  await call('/accounts/decide',{id:newcomer.id,status:'blocked'},bossSession);
  assert.equal((await call('/state',undefined,userSession)).status,401,'a blocked account loses its session');
  assert.equal((await call('/auth/request',{email:'newcomer@example.com'})).body.status,'blocked');

  // A superadmin cannot be locked out of the platform.
  const bossRecord=(await call('/accounts',undefined,bossSession)).body.find((a:any)=>a.email==='boss@example.com');
  assert.equal((await call('/accounts/decide',{id:bossRecord.id,status:'blocked'},bossSession)).status,422);

  // A used login link cannot be replayed.
  await call('/auth/request',{email:'boss@example.com'});
  const link=messageText(smtp.inbox.filter(m=>m.to==='boss@example.com').pop()!.body).match(/(https?:\/\/\S*auth\/callback\S*)/)?.[1]!;
  assert.equal((await fetch(link,{redirect:'manual'})).status,302);
  const replay=await fetch(link,{redirect:'manual'});
  assert.match(new URL(replay.headers.get('location')!).hash,/login-expired/);
 }finally{child.kill();smtp.server.close();}
});
