import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readIncrementalIncoming} from '../server/inboundcursor';

const apps={google:{clientId:'g',clientSecret:'gs'},microsoft:{clientId:'m',clientSecret:'ms',tenant:'common'}};

function stub(handler:(url:URL,body:string)=>{status?:number;json?:any;text?:string}){
 const server=createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{
  const out=handler(new URL(req.url!,'http://127.0.0.1'),body);res.statusCode=out.status??200;
  if(out.json!==undefined){res.setHeader('content-type','application/json');res.end(JSON.stringify(out.json));}
  else res.end(out.text??'');
 });});
 return new Promise<{base:string;close:()=>Promise<void>}>(resolve=>server.listen(0,'127.0.0.1',()=>{
  const address=server.address() as any;resolve({base:`http://127.0.0.1:${address.port}`,close:()=>new Promise(r=>server.close(()=>r()))});
 }));
}

test('Gmail initial sync returns messages plus a history cursor, then history returns only additions',async()=>{
 const calls:string[]=[];
 const s=await stub((url)=>{calls.push(url.pathname+url.search);
  if(url.pathname.endsWith('/token'))return {json:{access_token:'t'}};
  if(url.pathname.endsWith('/profile'))return {json:{historyId:'100'}};
  if(url.pathname.endsWith('/messages')&&!url.pathname.includes('/messages/'))return {json:{messages:[{id:'g1'}]}};
  if(url.pathname.endsWith('/messages/g1'))return {json:{id:'g1',threadId:'th1',internalDate:'1000',payload:{headers:[{name:'From',value:'A <a@example.com>'},{name:'Subject',value:'One'}]}}};
  if(url.pathname.endsWith('/history'))return {json:{historyId:'105',history:[{messagesAdded:[{message:{id:'g2'}}]}]}};
  if(url.pathname.endsWith('/messages/g2'))return {json:{id:'g2',threadId:'th2',internalDate:'2000',payload:{headers:[{name:'From',value:'B <b@example.com>'},{name:'Subject',value:'Two'}]}}};
  return {status:404,text:'missing'};
 });
 process.env.MAIL_PROVIDER_BASE_URL=s.base;
 try{
  const secret={kind:'oauth',provider:'google',email:'me@example.com',refreshToken:'r'};
  const first=await readIncrementalIncoming(secret,apps,null,10);
  assert.equal(first.reset,true);assert.equal(first.cursor?.value,'100');assert.equal(first.messages[0].providerId,'g1');
  const next=await readIncrementalIncoming(secret,apps,first.cursor,10);
  assert.equal(next.reset,false);assert.equal(next.cursor?.value,'105');assert.deepEqual(next.messages.map(m=>m.providerId),['g2']);
  assert.ok(calls.some(x=>x.includes('startHistoryId=100')));
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;await s.close();}
});

test('Gmail expired history cursor falls back to a bounded fresh baseline',async()=>{
 const s=await stub((url)=>{
  if(url.pathname.endsWith('/token'))return {json:{access_token:'t'}};
  if(url.pathname.endsWith('/history'))return {status:404,text:'history too old'};
  if(url.pathname.endsWith('/profile'))return {json:{historyId:'500'}};
  if(url.pathname.endsWith('/messages'))return {json:{messages:[]}};
  return {status:404,text:'missing'};
 });
 process.env.MAIL_PROVIDER_BASE_URL=s.base;
 try{const out=await readIncrementalIncoming({kind:'oauth',provider:'google',refreshToken:'r'},apps,{provider:'google',value:'1'},5);
  assert.equal(out.reset,true);assert.equal(out.cursor?.value,'500');}
 finally{delete process.env.MAIL_PROVIDER_BASE_URL;await s.close();}
});

test('Microsoft delta persists opaque deltaLink and follows nextLink',async()=>{
 const s=await stub((url)=>{
  if(url.pathname.endsWith('/token'))return {json:{access_token:'t'}};
  if(url.searchParams.get('page')==='2')return {json:{value:[{id:'m2',conversationId:'c2',from:{emailAddress:{address:'b@example.com'}},subject:'B'}],
   '@odata.deltaLink':`${s.base}/delta-final`}};
  if(url.pathname.includes('/messages/delta'))return {json:{value:[{id:'m1',conversationId:'c1',from:{emailAddress:{address:'a@example.com'}},subject:'A'}],
   '@odata.nextLink':`${s.base}/v1.0/me/mailFolders/inbox/messages/delta?page=2`}};
  if(url.pathname==='/delta-final')return {json:{value:[],'@odata.deltaLink':`${s.base}/delta-final-2`}};
  return {status:404,text:'missing'};
 });
 process.env.MAIL_PROVIDER_BASE_URL=s.base;
 try{
  const secret={kind:'oauth',provider:'microsoft',refreshToken:'r'};
  const first=await readIncrementalIncoming(secret,apps,null,10);
  assert.equal(first.reset,true);assert.deepEqual(first.messages.map(m=>m.providerId),['m1','m2']);
  assert.equal(first.cursor?.value,`${s.base}/delta-final`);
  const next=await readIncrementalIncoming(secret,apps,first.cursor,10);
  assert.equal(next.reset,false);assert.equal(next.cursor?.value,`${s.base}/delta-final-2`);
 }finally{delete process.env.MAIL_PROVIDER_BASE_URL;await s.close();}
});
