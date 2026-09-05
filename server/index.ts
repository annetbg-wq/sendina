import 'dotenv/config';
import express from 'express';
import {z} from 'zod';
import {init} from './store';
import {operations} from './operations';
import {mailboxOperations} from './mailboxes';
import {mountMailboxCallback} from './mailboxcallback';
import {mountAuth} from './auth';
import {mountMcp} from './mcp';
import {mountOauth} from './oauth';
import {bindAddress} from './config';
import {accountForSession,listAccounts,decideAccount,connectorCode,type Account} from './accounts';
import {accountSettings,saveAccountSettings,maskSettings} from './accountsettings';
import type {Ctx} from './context';

const app=express();app.use(express.json({limit:'1mb'}));
const origins=new Set(['http://127.0.0.1:5173','http://localhost:5173',`http://127.0.0.1:${process.env.VITE_PORT??5173}`,'http://127.0.0.1:3001',...(process.env.ALLOWED_ORIGINS??'').split(',').filter(Boolean)]);
app.get('/api/health',(_req,res)=>res.json({ok:true}));

const cors=(req:express.Request,res:express.Response)=>{
 const origin=req.headers.origin;
 if(!origin)return true;
 if(!origins.has(origin)){res.status(403).json({error:'Недопустимый источник запроса'});return false;}
 res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
 res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 return true;
};
app.use('/api',(req,res,next)=>{if(!cors(req,res))return;if(req.method==='OPTIONS')return res.sendStatus(204);next();});
mountAuth(app);

/** Every workspace route acts as one signed-in account. There is no shared workspace any more. */
declare global{namespace Express{interface Request{ctx?:Ctx;account?:Account;}}}
app.use('/api',async(req,res,next)=>{
 if(req.path.startsWith('/auth/')||req.path==='/health')return next();
 const token=req.headers.authorization?.replace(/^Bearer /,'')??'';
 const account=await accountForSession(token);
 if(!account)return res.status(401).json({error:'Требуется вход'});
 req.account=account;
 req.ctx={accountId:account.id,email:account.email,role:account.role};
 next();
});

const route=(fn:(ctx:Ctx,input:any)=>Promise<unknown>,status=200)=>async(req:express.Request,res:express.Response)=>
 res.status(status).json(await fn(req.ctx!,{...req.body,...req.params}));

app.get('/api/state',route(ctx=>operations.state(ctx)));
app.get('/api/capabilities',route(ctx=>operations.capabilities(ctx)));
app.post('/api/campaigns',route((c,i)=>operations.createCampaign(c,i),201));
app.post('/api/campaigns/:id/status',route((c,i)=>operations.setCampaignStatus(c,i)));
app.post('/api/campaigns/:id/contacts',route((c,i)=>operations.importContacts(c,i)));
app.post('/api/campaigns/:id/find',route((c,i)=>operations.findRecipients(c,i)));
app.post('/api/campaigns/:id/preview',route((c,i)=>operations.prepareMessages(c,i)));
app.post('/api/contacts/confirm',route((c,i)=>operations.confirmRecipient(c,i)));
app.post('/api/stop',route((c,i)=>operations.emergencyStop(c,i)));
app.post('/api/domains',route((c,i)=>operations.addMailbox(c,i)));
app.post('/api/domains/:id/check',route((c,i)=>operations.checkDomain(c,i)));
app.post('/api/replies',route((c,i)=>operations.recordReply(c,i)));
app.post('/api/suppress',route((c,i)=>operations.suppress(c,i)));
app.post('/api/settings/recipients',route((c,i)=>operations.setRecipientMode(c,i)));
app.get('/api/mailboxes/status',route(ctx=>mailboxOperations.status(ctx)));
app.post('/api/mailboxes/detect',route((c,i)=>mailboxOperations.detect(c,i)));
app.post('/api/mailboxes/oauth',route((c,i)=>mailboxOperations.startOauth(c,i)));
app.post('/api/mailboxes/smtp',route((c,i)=>mailboxOperations.connectSmtp(c,i)));
app.post('/api/mailboxes/test',route((c,i)=>mailboxOperations.testSend(c,i)));
app.post('/api/mailboxes/disconnect',route((c,i)=>mailboxOperations.disconnect(c,i)));

/** Connection settings belong to the account and are entered in the interface, not the environment. */
app.get('/api/settings/connections',route(async ctx=>maskSettings(await accountSettings(ctx.accountId))));
app.post('/api/settings/connections',route((ctx,input)=>saveAccountSettings(ctx.accountId,input)));
app.get('/api/settings/connector',route(async ctx=>({code:await connectorCode(ctx.accountId)})));
app.post('/api/settings/connector',route(async ctx=>({code:await connectorCode(ctx.accountId,true)})));

/** Superadmins manage who may enter. They never read another account's workspace. */
const superadminOnly=(req:express.Request,res:express.Response,next:express.NextFunction)=>
 req.account?.role==='superadmin'?next():res.status(403).json({error:'Доступ только для суперадминов'});
app.get('/api/accounts',superadminOnly,async(_req,res)=>res.json(await listAccounts()));
app.post('/api/accounts/decide',superadminOnly,async(req,res)=>res.json(await decideAccount(req.account!,req.body)));

app.post('/api/send',(_req,res)=>res.status(409).json({error:'Отправка не подключена. Требуются проверенный почтовый провайдер, версионированные правила юрисдикций и подтверждение первой партии.'}));
mountMailboxCallback(app);
mountOauth(app);
mountMcp(app);
app.use(express.static('dist'));app.get('/{*path}',(_req,res)=>res.sendFile('index.html',{root:'dist'}));
app.use((err:any,_req:any,res:any,_next:any)=>res.status(err instanceof z.ZodError?400:422).json({error:err instanceof z.ZodError?err.issues.map((i:any)=>`${i.path.join('.')}: ${i.message}`).join('; '):err.message}));
const {host,port}=bindAddress(process.env);
await init();app.listen(port,host,()=>console.log(`Sendina API: http://${host}:${port}`));
