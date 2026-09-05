import type {Express} from 'express';
import {z} from 'zod';
import {ensureAccount,issueLoginToken,consumeLoginToken,createSession,accountForSession,endSession,
 listAccounts,superadmins,isSuperadmin} from './accounts';
import {sendSystemMail,systemMailReady,mailTemplates} from './systemmail';
import {appAddress} from './config';

/** Passwordless login: an address gets a one-time link, and a new account waits for a superadmin. */
export function mountAuth(app:Express){
 const loginLink=(token:string)=>`${appAddress(process.env)}/auth/callback?token=${encodeURIComponent(token)}`;

 app.get('/api/auth/config',(_req,res)=>res.json({
  mailReady:systemMailReady(),
  superadmins:superadmins().length,
  app:appAddress(process.env)}));

 app.post('/api/auth/request',async(req,res)=>{
  const {email}=z.object({email:z.email()}).parse(req.body);
  const account=await ensureAccount(email);
  if(account.status==='blocked')
   return res.json({status:'blocked',message:'Доступ для этого адреса закрыт. Обратитесь к администратору.'});

  if(account.status==='pending'){
   // Nothing is sent to an unapproved address beyond an acknowledgement; the superadmins are asked to decide.
   const notices=systemMailReady()?await Promise.allSettled([
    sendSystemMail(account.email,mailTemplates.pending().subject,mailTemplates.pending().text),
    ...(await listAccounts()).filter(a=>a.role==='superadmin').map(admin=>{
     const t=mailTemplates.review(account.email,appAddress(process.env));
     return sendSystemMail(admin.email,t.subject,t.text);
    })]):[];
   const failed=notices.filter(n=>n.status==='rejected').length;
   return res.json({status:'pending',
    message:'Заявка принята. Доступ откроется после подтверждения администратором.',
    notified:notices.length-failed});
  }

  const token=issueLoginToken(account.id);
  const link=loginLink(token);
  if(!systemMailReady()){
   // Before platform mail exists nobody could sign in at all. A superadmin may bootstrap from the
   // server log, which needs server access anyway; the link itself never reaches the response body.
   if(account.role!=='superadmin')
    return res.status(503).json({status:'mail-unavailable',
     error:'Системная почта не настроена, отправить ссылку невозможно. Обратитесь к администратору.'});
   console.log(`[sendina] login link for ${account.email}: ${link}`);
   return res.json({status:'logged',
    message:'Системная почта не настроена. Ссылка для входа записана в журнал сервера.'});
  }
  const template=mailTemplates.login(link,20);
  try{await sendSystemMail(account.email,template.subject,template.text);}
  catch(e:any){
   // Without platform mail nobody could ever sign in, so say so plainly instead of failing silently.
   return res.status(503).json({status:'mail-unavailable',error:e.message});
  }
  res.json({status:'sent',message:'Ссылка для входа отправлена на вашу почту. Она действует 20 минут.'});
 });

 /** The provider of the link is the mailbox itself, so this arrives without a session. */
 app.get('/auth/callback',async(req,res)=>{
  const token=String(req.query.token??'');
  const accountId=consumeLoginToken(token);
  const target=new URL(appAddress(process.env));
  if(!accountId){target.hash='login-expired';return res.redirect(target.toString());}
  const session=await createSession(accountId);
  target.hash=`session=${encodeURIComponent(session)}`;
  res.redirect(target.toString());
 });

 app.get('/api/auth/session',async(req,res)=>{
  const account=await accountForSession(req.headers.authorization?.replace(/^Bearer /,'')??'');
  if(!account)return res.status(401).json({error:'Требуется вход'});
  res.json({email:account.email,role:account.role,status:account.status,
   superadmin:account.role==='superadmin'||isSuperadmin(account.email)});
 });

 app.post('/api/auth/logout',async(req,res)=>{
  await endSession(req.headers.authorization?.replace(/^Bearer /,'')??'');
  res.json({ok:true});
 });
}
