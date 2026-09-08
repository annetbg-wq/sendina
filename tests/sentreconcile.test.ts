import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {reconcileMicrosoftSent,reconcileGmailSent} from '../server/sentreconcile';

test('Microsoft accepted send can be reconciled by deterministic internet Message-ID',async()=>{
 let requested='';
 const server=createServer((req,res)=>{requested=req.url??'';res.setHeader('content-type','application/json');
  res.end(JSON.stringify({value:[{id:'graph-1',conversationId:'conv-7',internetMessageId:'<stable@example.com>',sentDateTime:'2026-09-08T10:00:00Z'}]}));
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{
  const found=await reconcileMicrosoftSent('access','<stable@example.com>');
  assert.deepEqual(found,{providerId:'graph-1',threadId:'conv-7',messageId:'<stable@example.com>',sentAt:'2026-09-08T10:00:00Z'});
  const url=new URL(requested,'http://stub');
  assert.equal(url.searchParams.get('$filter'),"internetMessageId eq '<stable@example.com>'");
  assert.equal(url.searchParams.get('$top'),'1');
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});

test('reconciliation returns null while Sent Items has not materialized the accepted message yet',async()=>{
 const server=createServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({value:[]}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{assert.equal(await reconcileMicrosoftSent('access','<missing@example.com>'),null);}
 finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});

test('OData string values are escaped rather than injected into the filter',async()=>{
 let requested='';
 const server=createServer((req,res)=>{requested=req.url??'';res.setHeader('content-type','application/json');res.end(JSON.stringify({value:[]}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{
  await reconcileMicrosoftSent('access',"<a'b@example.com>");
  const filter=new URL(requested,'http://stub').searchParams.get('$filter');
  assert.equal(filter,"internetMessageId eq '<a''b@example.com>'");
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});

test('Gmail UNKNOWN send is reconciled by RFC Message-ID in SENT',async()=>{
 const requests:string[]=[];
 const server=createServer((req,res)=>{
  const url=req.url??'';requests.push(url);res.setHeader('content-type','application/json');
  if(url.startsWith('/gmail/v1/users/me/messages?'))
   return res.end(JSON.stringify({messages:[{id:'gmail-9',threadId:'thread-2'}]}));
  if(url.startsWith('/gmail/v1/users/me/messages/gmail-9?'))
   return res.end(JSON.stringify({id:'gmail-9',threadId:'thread-2',internalDate:'1788868800000',
    payload:{headers:[{name:'Message-Id',value:'<stable@sender.example>'}]}}));
  res.statusCode=404;res.end('{}');
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{
  const found=await reconcileGmailSent('access','<stable@sender.example>');
  assert.deepEqual(found,{providerId:'gmail-9',threadId:'thread-2',messageId:'<stable@sender.example>',sentAt:'2026-09-08T12:00:00.000Z'});
  const list=new URL(requests[0],'http://stub');
  assert.equal(list.searchParams.get('q'),'rfc822msgid:<stable@sender.example>');
  assert.equal(list.searchParams.get('labelIds'),'SENT');
  assert.equal(list.searchParams.get('maxResults'),'1');
  const detail=new URL(requests[1],'http://stub');
  assert.equal(detail.searchParams.get('format'),'metadata');
  assert.equal(detail.searchParams.get('metadataHeaders'),'Message-Id');
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});

test('Gmail reconciliation returns null before the sent message is searchable',async()=>{
 const server=createServer((_req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({messages:[]}));});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as any;process.env.MAIL_PROVIDER_BASE_URL=`http://127.0.0.1:${address.port}`;
 try{assert.equal(await reconcileGmailSent('access','<missing@sender.example>'),null);}
 finally{delete process.env.MAIL_PROVIDER_BASE_URL;server.close();}
});
