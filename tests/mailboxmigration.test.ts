import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalize,seed} from '../server/seed';

test('a disconnected mailbox cannot carry old proofs or inbound cursor into a reconnect',()=>{
 const s=seed() as any;
 s.domains=[{id:'d1',name:'sender.example',dns:{spf:true,dkim:true,dmarc:true,checkedAt:'2026-09-08T10:00:00Z'},mailboxes:[{
  email:'out@sender.example',provider:'google',connection:'none',connectedAt:'2026-09-08T11:00:00Z',
  auth:{status:'ok',at:'2026-09-08T10:01:00Z',detail:'old'},
  testSend:{status:'ok',at:'2026-09-08T10:02:00Z',detail:'old'},
  imap:{status:'ok',at:'2026-09-08T10:03:00Z',detail:'old'},
  incoming:{status:'ok',at:'2026-09-08T10:04:00Z',detail:'old'},
  incomingUid:912,incomingCursor:{provider:'google',value:'history-old'},
  lastProviderError:{class:'REAUTH_REQUIRED',code:'invalid_grant',at:'2026-09-08T10:05:00Z'},
  transport:{label:'legacy metadata'}
 }]}];
 const mailbox=(normalize(s) as any).domains[0].mailboxes[0];
 assert.equal(mailbox.connectedAt,null);
 for(const field of ['auth','testSend','imap','incoming']){
  assert.equal(mailbox[field].status,'none',field);
  assert.equal(mailbox[field].at,null,field);
 }
 assert.equal(mailbox.incomingUid,0);
 assert.equal(mailbox.incomingCursor,null);
 assert.equal(mailbox.lastProviderError,null);
 assert.deepEqual(mailbox.transport,{label:'legacy metadata'},'non-secret migration metadata may remain visible');
});

test('legacy account OAuth app credentials are preserved internally but cannot be exposed or updated',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sendina-legacy-mail-settings-'));
 process.env.DATA_DIR=dir;
 process.env.DATABASE_URL='';
 const {setAuth}=await import('../server/authstore');
 const {accountSettings,maskSettings,saveAccountSettings}=await import('../server/accountsettings');
 const accountId='legacy-account';
 await setAuth(`settings:${accountId}`,{
  openaiKey:'',openaiModel:'',aiGatewayUrl:'',searchProvider:'',searchKey:'',
  google:{clientId:'old-google-id',clientSecret:'old-google-secret'},
  microsoft:{clientId:'old-ms-id',clientSecret:'old-ms-secret',tenant:'old-tenant'}
 });
 const stored=await accountSettings(accountId);
 assert.equal(stored.google.clientId,'old-google-id','old records remain readable for migration');
 assert.equal(stored.microsoft.tenant,'old-tenant');
 const publicView=maskSettings(stored) as any;
 assert.equal('google' in publicView,false,'ordinary settings API must not advertise legacy Google app config');
 assert.equal('microsoft' in publicView,false,'ordinary settings API must not advertise legacy Microsoft app config');
 await assert.rejects(()=>saveAccountSettings(accountId,{google:{clientId:'replacement'}}),
  'account endpoint must reject attempts to configure a private Google/Microsoft OAuth app');
 await saveAccountSettings(accountId,{openaiModel:'gpt-4.1'});
 const after=await accountSettings(accountId);
 assert.equal(after.openaiModel,'gpt-4.1');
 assert.equal(after.google.clientId,'old-google-id','unrelated settings updates preserve legacy migration data');
 assert.equal(after.microsoft.clientSecret,'old-ms-secret');
});

test('setting auth data to null physically removes the stored credential instead of leaving a tombstone',async()=>{
 const dir=process.env.DATA_DIR!;
 const {setAuth,getAuth}=await import('../server/authstore');
 await setAuth('mailbox:legacy-account:out@example.com',{secret:'TOP_SECRET_VALUE'});
 await setAuth('mailbox:legacy-account:out@example.com',null);
 assert.equal(await getAuth('mailbox:legacy-account:out@example.com'),null);
 const raw=await readFile(join(dir,'auth.json'),'utf8');
 assert.equal(raw.includes('TOP_SECRET_VALUE'),false);
 assert.equal(raw.includes('mailbox:legacy-account:out@example.com'),false,'the key itself is removed too');
});
