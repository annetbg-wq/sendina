import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';

const apps={
 google:{clientId:'g-client',clientSecret:'g-secret'},
 microsoft:{clientId:'m-client',clientSecret:'m-secret',tenant:'common'}
};

async function withProviderStub(run:(base:string)=>Promise<void>){
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url??'/',`http://${req.headers.host}`);
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'&&(url.pathname.includes('/token')||url.pathname.includes('/oauth2/v2.0/token'))){
   res.end(JSON.stringify({access_token:'access'}));return;
  }
  if(url.pathname==='/gmail/v1/users/me/messages'&&!url.searchParams.has('format')){
   res.end(JSON.stringify({messages:[{id:'gmail-provider-id'}]}));return;
  }
  if(url.pathname==='/gmail/v1/users/me/messages/gmail-provider-id'){
   res.end(JSON.stringify({id:'gmail-provider-id',threadId:'gmail-thread-id',internalDate:'1770000000000',
    payload:{headers:[{name:'From',value:'Reply <reply@example.com>'},{name:'Subject',value:'Re: hello'},
     {name:'Message-ID',value:'<rfc822@example.com>'}],mimeType:'text/plain',body:{data:Buffer.from('hello').toString('base64url')}}}));return;
  }
  if(url.pathname==='/v1.0/me/messages'){
   res.end(JSON.stringify({value:[{id:'graph-provider-id',conversationId:'graph-thread-id',
    internetMessageId:'<graph-rfc@example.com>',receivedDateTime:'2026-09-08T09:00:00Z',
    from:{emailAddress:{address:'reply@example.com'}},subject:'Re: hello',bodyPreview:'hello'}]}));return;
  }
  res.statusCode=404;res.end(JSON.stringify({error:'not found',path:url.pathname,search:url.search}));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();
 if(!address||typeof address==='string')throw Error('stub did not bind');
 const base=`http://127.0.0.1:${address.port}`;
 try{await run(base);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

test('Gmail mapping preserves provider message and thread ids',async()=>{
 await withProviderStub(async base=>{
  process.env.MAIL_PROVIDER_BASE_URL=base;
  const {readIncoming}=await import('../server/mailproviders');
  const [message]=await readIncoming({kind:'oauth',provider:'google',email:'me@example.com',refreshToken:'refresh'},apps,10);
  assert.equal(message.providerId,'gmail-provider-id');
  assert.equal(message.threadId,'gmail-thread-id');
  assert.equal(message.messageId,'<rfc822@example.com>');
  assert.equal(message.from,'reply@example.com');
 });
});

test('Microsoft Graph mapping preserves provider message and conversation ids',async()=>{
 await withProviderStub(async base=>{
  process.env.MAIL_PROVIDER_BASE_URL=base;
  const {readIncoming}=await import('../server/mailproviders');
  const [message]=await readIncoming({kind:'oauth',provider:'microsoft',email:'me@example.com',refreshToken:'refresh'},apps,10);
  assert.equal(message.providerId,'graph-provider-id');
  assert.equal(message.threadId,'graph-thread-id');
  assert.equal(message.messageId,'<graph-rfc@example.com>');
  assert.equal(message.from,'reply@example.com');
 });
});
