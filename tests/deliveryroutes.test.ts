import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mountDeliveryRoutes} from '../server/deliveryroutes';

test('delivery reconciliation route refuses requests without authenticated account context',async()=>{
 const app=express();app.use(express.json());mountDeliveryRoutes(app);
 const server=app.listen(0,'127.0.0.1');
 await new Promise<void>(r=>server.once('listening',()=>r()));
 const address=server.address() as any;
 try{
  const response=await fetch(`http://127.0.0.1:${address.port}/api/messages/m1/reconcile`,{method:'POST'});
  assert.equal(response.status,401);
  assert.deepEqual(await response.json(),{error:'Требуется вход'});
 }finally{server.close();}
});
