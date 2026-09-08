import type {Express} from 'express';
import type {Ctx} from './context';
import {reconcileUnknownDelivery} from './deliveryrecovery';

/** Auth is installed on /api before this router is mounted in index.ts, so this operation is
 * account-scoped exactly like every other workspace mutation. It never sends mail. */
export function mountDeliveryRoutes(app:Express){
 app.post('/api/messages/:id/reconcile',async(req,res,next)=>{
  try{
   const ctx=(req as any).ctx as Ctx|undefined;
   if(!ctx)return res.status(401).json({error:'Требуется вход'});
   res.json(await reconcileUnknownDelivery(ctx,{id:String(req.params.id??'')}));
  }catch(e){next(e);}
 });
}
