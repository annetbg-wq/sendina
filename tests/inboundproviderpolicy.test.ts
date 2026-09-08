import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readIncrementalIncoming} from '../server/inboundcursor';
import {ProviderRequestError} from '../server/providerrequest';

const apps={google:{clientId:'g',clientSecret:'gs'},microsoft:{clientId:'m',clientSecret:'ms',tenant:'common'}};
const secret={kind:'oauth',provider:'google',email:'out@example.com',refreshToken:'refresh'};

test('incremental inbox token refresh retries a transient provider failure',async()=>{
 let tokenCalls=0;
 const server=createServer((req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/token'){
   tokenCalls++;
   if(tokenCalls===1){res.statusCode=503;res.setHeader('retry-after','0');return res.end(JSON.stringify({error:'temporary'}));}
   return res.end(JSON.stringify({access_token:'access'}));
  }
  if(req.url?.includes('/profile'))return res.end(JSON.stringify({historyId:'h1'}));
  if(req.url?.includes('/messages'))return res.end(JSON.stringify({messages:[]}));
  res.statusCode=404;res.end('{}');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{
  const result=await readIncrementalIncoming(secret,apps,null,5);
  assert.equal(tokenCalls,2);
  assert.deepEqual(result.cursor,{provider:'google',value:'h1'});
  assert.equal(result.messages.length,0);
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});

test('revoked OAuth token is normalized as REAUTH_REQUIRED during inbound sync',async()=>{
 const server=createServer((req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/token'){res.statusCode=400;return res.end(JSON.stringify({error:'invalid_grant',error_description:'Token has been revoked'}));}
  res.statusCode=404;res.end('{}');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{
  await assert.rejects(()=>readIncrementalIncoming(secret,apps,null,5),(e:any)=>{
   assert.ok(e instanceof ProviderRequestError);
   assert.equal(e.provider.class,'REAUTH_REQUIRED');
   assert.equal(e.provider.status,400);
   return true;
  });
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});
