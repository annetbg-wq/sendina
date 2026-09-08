import type {Express} from 'express';
import {mailboxOperations} from './mailboxes';
import {mountDeliveryRoutes} from './deliveryroutes';
import {mountMailboxProviderFailureRecorder} from './mailboxproviderfailure';
import {startMailboxRecoveryWorker} from './mailboxworker';

/** The provider redirects a browser here, so this page is reached without the workspace token. */
const strings={
 ru:{ok:'Ящик подключён',okLead:'Осталось выполнить тестовую отправку — без неё ящик не получит статус «готов».',
  fail:'Подключить не удалось',back:'Вернитесь во вкладку Sendina.'},
 en:{ok:'Mailbox connected',okLead:'One test send is still required; without it the mailbox does not become ready.',
  fail:'Could not connect',back:'Return to the Sendina tab.'}
};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]!));
const page=(lang:'ru'|'en',title:string,lead:string,detail:string,bad:boolean)=>
`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escape(title)} — Sendina</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f9fc;font:14px/1.7 system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#182133;padding:24px}
.card{background:#fff;border:1px solid #e3e9f3;border-radius:14px;padding:32px;width:420px;max-width:100%;box-shadow:0 18px 60px #1b2b4a14;text-align:center}
.mark{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;margin:0 auto 18px;font-size:22px;background:${bad?'#fff0f0':'#ecf8ef'};color:${bad?'#c04a4a':'#2c8f52'}}
h1{font-size:19px;letter-spacing:-.4px;margin:0 0 10px}p{color:#7d8798;font-size:13px;margin:0 0 8px}
code{background:#f4f6fa;border-radius:5px;padding:2px 6px;font-size:12px;color:#5b6577}</style></head>
<body><div class="card"><div class="mark">${bad?'!':'✓'}</div><h1>${escape(title)}</h1><p>${escape(lead)}</p>${detail?`<p><code>${escape(detail)}</code></p>`:''}</div></body></html>`;

export function mountMailboxCallback(app:Express){
 app.get('/oauth/mailbox/callback',async(req,res)=>{
  const lang:'ru'|'en'=String(req.headers['accept-language']??'').toLowerCase().includes('ru')?'ru':'en';
  const t=strings[lang];
  const code=String(req.query.code??''),state=String(req.query.state??'');
  if(req.query.error)return res.status(400).type('html').send(page(lang,t.fail,t.back,String(req.query.error_description??req.query.error),true));
  if(!code||!state)return res.status(400).type('html').send(page(lang,t.fail,t.back,'missing code or state',true));
  try{
   const result=await mailboxOperations.completeOauth(code,state);
   res.type('html').send(page(lang,t.ok,`${result.email} · ${t.okLead}`,'',false));
  }catch(e:any){res.status(400).type('html').send(page(lang,t.fail,t.back,String(e.message).slice(0,300),true));}
 });
 mountDeliveryRoutes(app);
 mountMailboxProviderFailureRecorder(app);
 startMailboxRecoveryWorker();
}
