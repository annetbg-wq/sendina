import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {reconcileMicrosoftSent} from '../server/sentreconcile';

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
