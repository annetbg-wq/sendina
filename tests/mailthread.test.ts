import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mailProvider} from '../server/mailcontract';

const apps={google:{clientId:'g',clientSecret:'gs'},microsoft:{clientId:'m',clientSecret:'ms',tenant:'common'}};

test('Gmail and Microsoft expose real provider threads through the common contract',async()=>{
 const calls:string[]=[];
 const server=createServer((req,res)=>{
  const url=new URL(req.url??'/','http://stub');calls.push(url.pathname+url.search);res.setHeader('content-type','application/json');
  if(url.pathname==='/token'||url.pathname.endsWith('/oauth2/v2.0/token'))return res.end(JSON.stringify({access_token:'access'}));
  if(url.pathname==='/gmail/v1/users/me/threads/g-thread')return res.end(JSON.stringify({id:'g-thread',messages:[{
   id:'gm-1',threadId:'g-thread',internalDate:'1700000000000',payload:{mimeType:'text/plain',headers:[
    {name:'From',value:'Buyer <buyer@example.net>'},{name:'Subject',value:'Re: Hello'},
    {name:'Message-Id',value:'<gm-1@example.net>'},{name:'In-Reply-To',value:'<out@example.com>'},
    {name:'References',value:'<out@example.com>'}],body:{data:Buffer.from('Gmail thread body').toString('base64url')}}
  }]}));
  if(url.pathname==='/v1.0/me/messages'){
   assert.equal(url.searchParams.get('$filter'),"conversationId eq 'conv''quoted'",'Graph thread id must be OData escaped');
   return res.end(JSON.stringify({value:[
    {id:'ms-2',conversationId:"conv'quoted",internetMessageId:'<ms-2@example.net>',receivedDateTime:'2026-09-08T12:02:00Z',subject:'Second',bodyPreview:'two',from:{emailAddress:{address:'two@example.net'}}},
    {id:'ms-1',conversationId:"conv'quoted",internetMessageId:'<ms-1@example.net>',receivedDateTime:'2026-09-08T12:01:00Z',subject:'First',body:{content:'one'},from:{emailAddress:{address:'one@example.net'}}}
   ]}));
  }
  res.statusCode=404;res.end('{}');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const port=(server.address() as any).port;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${port}`;
 try{
  const gmail=mailProvider({kind:'oauth',provider:'google',email:'out@gmail.test',refreshToken:'r'},apps);
  const gt=await gmail.getThread('g-thread');
  assert.equal(gt.supported,true);assert.equal(gt.threadId,'g-thread');assert.equal(gt.messages.length,1);
  assert.equal(gt.messages[0].providerId,'gm-1');assert.equal(gt.messages[0].threadId,'g-thread');
  assert.equal(gt.messages[0].from,'buyer@example.net');assert.equal(gt.messages[0].text,'Gmail thread body');

  const microsoft=mailProvider({kind:'oauth',provider:'microsoft',email:'out@m365.test',refreshToken:'r'},apps);
  const mt=await microsoft.getThread("conv'quoted");
  assert.equal(mt.supported,true);assert.equal(mt.messages.length,2);
  assert.deepEqual(mt.messages.map(m=>m.providerId),['ms-1','ms-2'],'Graph conversation is normalized chronologically');
  assert.equal(mt.messages[0].threadId,"conv'quoted");
  assert.ok(calls.some(c=>c.startsWith('/gmail/v1/users/me/threads/g-thread?format=full')));
  assert.ok(calls.some(c=>c.startsWith('/v1.0/me/messages?')));
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});
