import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Socket} from 'node:net';
import {sendMessage} from '../server/mailproviders';
import {readIncrementalIncoming} from '../server/inboundcursor';

const apps={google:{clientId:'g',clientSecret:'gs'},microsoft:{clientId:'m',clientSecret:'ms',tenant:'common'}};
const blockedPorts=new Set([465,587,993]);

/** Production providers are contacted by HTTPS. This guard makes any accidental fallback to the
 * traditional mail ports an immediate test failure while still allowing the local HTTPS-API stub. */
async function withMailPortsBlocked<T>(run:(attempts:number[])=>Promise<T>):Promise<T>{
 const original=(Socket.prototype as any).connect;
 const attempts:number[]=[];
 (Socket.prototype as any).connect=function(...args:any[]){
  const first=args[0];
  const port=typeof first==='object'&&first!==null?Number(first.port):Number(first);
  if(blockedPorts.has(port)){
   attempts.push(port);
   throw Object.assign(new Error(`Acceptance gate blocked outbound mail port ${port}`),{code:'ECONNREFUSED'});
  }
  return original.apply(this,args);
 };
 try{return await run(attempts);}finally{(Socket.prototype as any).connect=original;}
}

function providerStub(){
 const calls:string[]=[];
 const server=createServer((req,res)=>{
  const url=req.url??'';calls.push(`${req.method} ${url}`);res.setHeader('content-type','application/json');
  if(url==='/token')return res.end(JSON.stringify({access_token:'access'}));
  if(url.includes('/gmail/v1/users/me/messages/send'))return res.end(JSON.stringify({id:'g-send',threadId:'g-thread'}));
  if(url.includes('/gmail/v1/users/me/profile'))return res.end(JSON.stringify({historyId:'g-history'}));
  if(url.includes('/gmail/v1/users/me/messages'))return res.end(JSON.stringify({messages:[]}));
  if(url.includes('/v1.0/me/sendMail')){res.statusCode=202;return res.end('{}');}
  if(url.includes('/v1.0/me/mailFolders/inbox/messages/delta'))return res.end(JSON.stringify({
   value:[],
   '@odata.deltaLink':'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=delta-1'
  }));
  res.statusCode=404;res.end('{}');
 });
 return {server,calls};
}

test('Google and Microsoft OAuth send + inbound sync work with 465/587/993 blocked',async()=>{
 const stub=providerStub();
 await new Promise<void>(r=>stub.server.listen(0,'127.0.0.1',r));
 const address=stub.server.address() as any;
 process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{
  await withMailPortsBlocked(async attempts=>{
   const google={kind:'oauth',provider:'google',email:'out@workspace.example',refreshToken:'refresh'};
   const googleSent=await sendMessage(google,'buyer@example.net','Google API','Body',apps);
   assert.equal(googleSent.id,'g-send');
   assert.equal(googleSent.threadId,'g-thread');
   const googleInbox=await readIncrementalIncoming(google,apps,null,10);
   assert.deepEqual(googleInbox.cursor,{provider:'google',value:'g-history'});
   assert.equal(googleInbox.messages.length,0);

   const microsoft={kind:'oauth',provider:'microsoft',email:'out@m365.example',refreshToken:'refresh'};
   const microsoftSent=await sendMessage(microsoft,'buyer@example.net','Graph API','Body',apps);
   assert.equal(microsoftSent.via,'Microsoft Graph');
   assert.match(microsoftSent.messageId,/^<sendina-[a-f0-9]{32}@m365\.example>$/);
   const microsoftInbox=await readIncrementalIncoming(microsoft,apps,null,10);
   assert.equal(microsoftInbox.messages.length,0);
   assert.equal(microsoftInbox.cursor?.provider,'microsoft');
   assert.match(microsoftInbox.cursor?.value??'',/\$deltatoken=delta-1/);

   assert.deepEqual(attempts,[],`primary provider path must not touch blocked mail ports: ${attempts.join(',')}`);
  });

  assert.ok(stub.calls.some(c=>c.includes('/gmail/v1/users/me/messages/send')),'Gmail API carried the send');
  assert.ok(stub.calls.some(c=>c.includes('/v1.0/me/sendMail')),'Microsoft Graph carried the send');
  assert.ok(stub.calls.some(c=>c.includes('/gmail/v1/users/me/profile')),'Gmail API carried inbound sync');
  assert.ok(stub.calls.some(c=>c.includes('/mailFolders/inbox/messages/delta')),'Graph API carried inbound sync');
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;stub.server.close();}
});
