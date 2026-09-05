import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {smtpStub} from './smtpstub';
import {signIn,platformEnv} from './session';

/** Stands in for Google: the token endpoint and the Gmail send endpoint. */
function provider(){
 const sent:any[]=[];
 let failSend=false;
 const server=createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);
  req.on('end',()=>{
   res.setHeader('Content-Type','application/json');
   if(req.url==='/token')return res.end(JSON.stringify({access_token:'stub-access',refresh_token:'stub-refresh',scope:'gmail.send'}));
   if(req.url?.includes('/messages/send')){
    if(failSend){res.statusCode=403;return res.end(JSON.stringify({error:{message:'Delegation denied'}}));}
    sent.push({auth:req.headers.authorization,body:JSON.parse(body||'{}')});
    return res.end(JSON.stringify({id:'stub-message-1'}));
   }
   res.statusCode=404;res.end('{}');
  });
 });
 return {server,sent,fail:(v:boolean)=>{failSend=v;}};
}

test('a mailbox becomes ready only after a connection, a test send and the domain records',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-connect-'));
 const stub=provider();
 await new Promise<void>(r=>stub.server.listen(3198,'127.0.0.1',r));
 const smtp=smtpStub(3196);
 await smtp.listen();
 const base='http://127.0.0.1:3105';
 const child=spawn(process.execPath,['--import','tsx',resolve('server/index.ts')],{stdio:'pipe',env:{...process.env,
  PORT:'3105',DATA_DIR:dir,DATABASE_URL:'',APP_TOKEN:'operator-secret',MCP_TOKEN:'',OAUTH_ISSUER:'',OAUTH_JWKS_URL:'',
  PUBLIC_URL:base,APP_URL:base,MAIL_PROVIDER_BASE_URL:'http://127.0.0.1:3198',
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
  // The OAuth application now belongs to the account, filled in through the interface.
  await req('/settings/connections',{google:{clientId:'stub-client',clientSecret:'stub-secret'}});
  const email='outreach@no-such-domain-for-sendina.example';

  // Detection reports a route but connects nothing.
  const detected=(await req('/mailboxes/detect',{email})).body;
  assert.equal(detected.provider,'smtp');
  assert.equal(detected.route,'smtp');
  assert.equal(detected.redirectUri,`${base}/oauth/mailbox/callback`);
  assert.equal((await req('/state')).body.domains.some((d:any)=>d.name.includes('no-such-domain')),false,
   'detection alone must not create anything');

  // The operator overrides detection, as when a security gateway fronts the domain.
  const start=(await req('/mailboxes/oauth',{email,provider:'google'})).body;
  const authorize=new URL(start.url);
  assert.equal(authorize.searchParams.get('redirect_uri'),`${base}/oauth/mailbox/callback`);
  assert.equal(authorize.searchParams.get('access_type'),'offline');
  assert.equal(authorize.searchParams.get('login_hint'),email);
  const state=authorize.searchParams.get('state')!;

  // Still nothing is connected until the provider redirects back.
  assert.equal((await req('/mailboxes/status')).body.domains.length,2,'only the two sample domains so far');

  const callback=await fetch(`${base}/oauth/mailbox/callback?code=stub-code&state=${state}`);
  assert.equal(callback.status,200);
  assert.match(await callback.text(),/Mailbox connected|Ящик подключён/);

  let {mailbox}=await boxOf(email);
  assert.equal(mailbox.connection,'oauth');
  assert.equal(mailbox.provider,'google');
  assert.equal(mailbox.readiness.ready,false);
  assert.ok(mailbox.readiness.blockers.includes('TEST_SEND_REQUIRED'));

  // The refresh token is a secret and must never reach the workspace the UI reads.
  const workspace=JSON.stringify((await req('/state')).body);
  assert.ok(!workspace.includes('stub-refresh'),'a refresh token must not appear in the workspace state');
  assert.ok(JSON.stringify(JSON.parse(await readFile(join(dir,'auth.json'),'utf8'))).includes('stub-refresh'));

  // A failing test send is recorded as a failure and grants nothing.
  stub.fail(true);
  const failed=(await req('/mailboxes/test',{email})).body;
  assert.equal(failed.testSend.status,'failed');
  assert.equal(failed.ready,false);
  assert.ok((await boxOf(email)).mailbox.readiness.blockers.includes('TEST_SEND_FAILED'));

  // A successful one sends a real message through the connected account.
  stub.fail(false);
  const ok=(await req('/mailboxes/test',{email})).body;
  assert.equal(ok.testSend.status,'ok');
  assert.equal(stub.sent.length,1);
  assert.equal(stub.sent[0].auth,'Bearer stub-access');
  const raw=Buffer.from(stub.sent[0].body.raw,'base64url').toString();
  assert.match(raw,new RegExp(`From: ${email}`));

  // Connected and tested, yet still not ready: the domain records were never checked.
  let after=await boxOf(email);
  assert.equal(after.mailbox.readiness.ready,false);
  assert.deepEqual(after.mailbox.readiness.blockers,['DNS_NOT_CHECKED']);
  assert.equal(after.domain.readiness.ready,false);

  // A DNS check on a domain with no records reports what is missing and still grants nothing.
  await req(`/domains/${after.domain.id}/check`,{});
  after=await boxOf(email);
  assert.equal(after.mailbox.readiness.ready,false);
  assert.deepEqual(after.mailbox.readiness.blockers,['SPF_MISSING','DKIM_MISSING','DMARC_MISSING']);

  // Disconnecting drops the credential and the mailbox falls back to unconnected.
  await req('/mailboxes/disconnect',{email});
  const gone=await boxOf(email);
  assert.equal(gone.mailbox.connection,'none');
  assert.ok(gone.mailbox.readiness.blockers.includes('NOT_CONNECTED'));
  assert.equal((await req('/mailboxes/test',{email})).status,422,'a disconnected mailbox cannot be tested');
 }finally{child.kill();stub.server.close();smtp.server.close();}
});
