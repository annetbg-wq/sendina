import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {verifyAccess,sendMessage} from '../server/mailproviders';
import {ProviderRequestError} from '../server/providerrequest';

const apps={google:{clientId:'g',clientSecret:'gs'},microsoft:{clientId:'m',clientSecret:'ms',tenant:'common'}};
const secret={kind:'oauth',provider:'google',email:'sales@example.com',refreshToken:'r'};

test('OAuth token refresh retries a transient provider failure',async()=>{
 let tokens=0;
 const server=createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{
  if(req.url==='/token'){
   tokens++;
   res.setHeader('content-type','application/json');
   if(tokens===1){res.statusCode=503;res.setHeader('Retry-After','0');return res.end(JSON.stringify({error:'temporarily_unavailable'}));}
   return res.end(JSON.stringify({access_token:'access'}));
  }
  res.statusCode=404;res.end('{}');
 });});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{
  assert.equal(await verifyAccess(secret,apps),'Токен провайдера принят');
  assert.equal(tokens,2,'safe token refresh should retry the 503');
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});

test('an ambiguous send 500 is not automatically repeated',async()=>{
 let sends=0;
 const server=createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{
  if(req.url==='/token'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({access_token:'access'}));}
  if(req.url?.includes('/messages/send')){sends++;res.statusCode=500;return res.end('upstream uncertain');}
  res.statusCode=404;res.end('{}');
 });});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{
  await assert.rejects(()=>sendMessage(secret,'buyer@example.net','Hi','Body',apps),
   (e:any)=>e instanceof ProviderRequestError&&e.provider.class==='RETRYABLE'&&e.provider.status===500);
  assert.equal(sends,1,'ambiguous send failures must go to reconciliation, never blind retry');
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});

test('an explicit send 429 may retry because the provider rejected the request',async()=>{
 let sends=0;
 const server=createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/token')return res.end(JSON.stringify({access_token:'access'}));
  if(req.url?.includes('/messages/send')){
   sends++;
   if(sends===1){res.statusCode=429;res.setHeader('Retry-After','0');return res.end(JSON.stringify({error:'rate_limit'}));}
   return res.end(JSON.stringify({id:'g-after-retry'}));
  }
  res.statusCode=404;res.end('{}');
 });});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{
  const sent=await sendMessage(secret,'buyer@example.net','Hi','Body',apps);
  assert.equal(sent.id,'g-after-retry');
  assert.equal(sends,2);
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});
