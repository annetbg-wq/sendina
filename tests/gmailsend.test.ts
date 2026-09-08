import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {sendMessage} from '../server/mailproviders';

const apps={google:{clientId:'g',clientSecret:'gs'},microsoft:{clientId:'m',clientSecret:'ms',tenant:'common'}};

test('Gmail send uses multipart RFC822, thread id and returns provider ids',async()=>{
 let sentBody:any=null;
 const server=createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/token')return res.end(JSON.stringify({access_token:'access'}));
  if(req.url?.includes('/messages/send')){sentBody=JSON.parse(body);return res.end(JSON.stringify({id:'gmail-123',threadId:'thread-9'}));}
  res.statusCode=404;res.end('{}');
 });});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{
  const result=await sendMessage({kind:'oauth',provider:'google',email:'out@example.com',refreshToken:'r'},
   'buyer@example.net','Привет','Plain',apps,{html:'<p>HTML</p>',replyTo:'reply@example.com',
    messageId:'<fixed@example.com>',inReplyTo:'<old@example.net>',references:['<old@example.net>'],threadId:'thread-8'});
  assert.deepEqual(result,{id:'gmail-123',threadId:'thread-9',messageId:'<fixed@example.com>',via:'Gmail API'});
  assert.equal(sentBody.threadId,'thread-8');
  const mime=Buffer.from(sentBody.raw,'base64url').toString('utf8');
  assert.match(mime,/multipart\/alternative/);
  assert.match(mime,/Message-ID: <fixed@example.com>/);
  assert.match(mime,/Reply-To: reply@example.com/);
  assert.match(mime,/In-Reply-To: <old@example.net>/);
  assert.match(mime,/References: <old@example.net>/);
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});

test('legacy plain-text caller remains source-compatible',async()=>{
 let raw='';
 const server=createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/token')return res.end(JSON.stringify({access_token:'access'}));
  if(req.url?.includes('/messages/send')){raw=JSON.parse(body).raw;return res.end(JSON.stringify({id:'g1'}));}
  res.statusCode=404;res.end('{}');
 });});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{
  const result=await sendMessage({kind:'oauth',provider:'google',email:'out@example.com',refreshToken:'r'},'buyer@example.net','Hi','Body',apps);
  const mime=Buffer.from(raw,'base64url').toString('utf8');
  assert.match(mime,/Content-Type: text\/plain; charset=UTF-8/);
  assert.doesNotMatch(mime,/multipart\/alternative/);
  assert.match(result.messageId,/^<sendina-[a-f0-9]{32}@example\.com>$/);
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});
