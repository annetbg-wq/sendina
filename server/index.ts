import 'dotenv/config';
import express from 'express';
import {z} from 'zod';
import {init} from './store';
import {operations} from './operations';
import {mailboxOperations} from './mailboxes';
import {mailboxStatusView} from './mailboxstatusview';
import {clearMailboxProviderHealth,recordMailboxProviderError} from './mailboxhealth';
import {mountMailboxCallback} from './mailboxcallback';
import {mountAuth} from './auth';
import {mountMcp} from './mcp';
import {mountOauth} from './oauth';
import {bindAddress} from './config';
import {originAllowed} from './origins';
import {countries,regions} from './geo';
import {supportView,supportLog} from './support';
import {accountForSession,listAccounts,decideAccount,connectorCode,type Account} from './accounts';
import {accountSettings,saveAccountSettings,maskSettings} from './accountsettings';
import {platformSettings,savePlatformSettings,maskPlatform} from './platform';
import {systemMailStatus,testSystemMail} from './systemmail';
import type {Ctx} from './context';

const app=express();app.use(express.json({limit:'1mb'}));
app.set('trust proxy',true);
app.get('/api/health',(_req,res)=>res.json({ok:true}));

const cors=(req:express.Request,res:express.Response)=>{
 const origin=req.headers.origin;
 if(!originAllowed(origin,req)){res.status(403).json({error:'Недопустимый источник запроса'});return false;}
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
 return true;
};
app.use('/api',(req,res,next)=>{if(!cors(req,res))return;if(req.method==='OPTIONS')return res.sendStatus(204);next();});
mountAuth(app);

declare global{namespace Express{interface Request{ctx?:Ctx;account?:Account;}}}
app.use('/api',async(req,res,next)=>{
 if(req.path.startsWith('/auth/')||req.path==='/health')return next();
 const token=req.headers.authorization?.replace(/^Bearer /,'')??'';
 const account=await accountForSession(token);
 if(!account)return res.status(401).json({error:'Требуется вход'});
 req.account=account;req.ctx={accountId:account.id,email:account.email,role:account.role};next();
});

const route=(fn:(ctx:Ctx,input:any)=>Promise<unknown>,status=200)=>async(req:express.Request,res:express.Response)=>res.status(status).json(await fn(req.ctx!,{...req.body,...req.params}));
const mailboxRoute=(fn:(ctx:Ctx,input:any)=>Promise<unknown>,status=200)=>async(req:express.Request,res:express.Response)=>{
 const input={...req.body,...req.params};const email=String(input.email??'').trim().toLowerCase();
 if(email)await clearMailboxProviderHealth(req.ctx!.accountId,email);
 try{res.status(status).json(await fn(req.ctx!,input));}
 catch(error){if(email)await recordMailboxProviderError(req.ctx!.accountId,email,error);throw error;}
};

app.get('/api/state',route(ctx=>operations.state(ctx)));
app.get('/api/capabilities',route(ctx=>operations.capabilities(ctx)));
app.post('/api/campaigns',route((c,i)=>operations.createCampaign(c,i),201));
app.post('/api/recommend-market',route((c,i)=>operations.recommendMarket(c,i)));
app.post('/api/campaigns/:id/status',route((c,i)=>operations.setCampaignStatus(c,i)));
app.post('/api/campaigns/:id/contacts',route((c,i)=>operations.importContacts(c,i)));
app.post('/api/campaigns/:id/find',route((c,i)=>operations.findRecipients(c,i)));
app.post('/api/campaigns/:id/preview',route((c,i)=>operations.prepareMessages(c,i)));
app.post('/api/campaigns/:id/launch-preview',route((c,i)=>operations.launchPreview(c,i)));
app.post('/api/campaigns/:id/control',route((c,i)=>operations.setControlMode(c,i)));
app.post('/api/campaigns/:id/approve',route((c,i)=>operations.approveFirstBatch(c,i)));
app.post('/api/campaigns/:id/propose',route((c,i)=>operations.proposeRecipients(c,i)));
app.post('/api/contacts/confirm',route((c,i)=>operations.confirmRecipient(c,i)));
app.post('/api/stop',route((c,i)=>operations.emergencyStop(c,i)));
app.post('/api/domains',route((c,i)=>operations.addMailbox(c,i)));
app.post('/api/domains/:id/check',route((c,i)=>operations.checkDomain(c,i)));
app.post('/api/replies',route((c,i)=>operations.recordReply(c,i)));
app.post('/api/suppress',route((c,i)=>operations.suppress(c,i)));
app.post('/api/settings/recipients',route((c,i)=>operations.setRecipientMode(c,i)));
app.get('/api/geo',(_req,res)=>res.json({countries,regions}));
app.get('/api/opportunities',route(ctx=>operations.listOpportunities(ctx)));
app.post('/api/opportunities/research',route((c,i)=>operations.researchOpportunities(c,i)));
app.get('/api/markets',route(ctx=>operations.listMarkets(ctx)));
app.post('/api/markets/research',route((c,i)=>operations.researchMarkets(c,i)));
app.post('/api/research/save',route((c,i)=>operations.saveResearch(c,i)));
app.post('/api/favourites',route((c,i)=>operations.saveFavourite(c,i)));
app.post('/api/favourites/remove',route((c,i)=>operations.removeFavourite(c,i)));
app.post('/api/research/campaign',route((c,i)=>operations.createTestFromResearch(c,i),201));
app.get('/api/threads',route(ctx=>operations.threads(ctx)));
app.post('/api/threads/action',route((c,i)=>operations.setThreadAction(c,i)));
app.post('/api/analytics',route((c,i)=>operations.analytics(c,i)));
app.post('/api/demo',route((c,i)=>operations.setDemo(c,i)));
app.get('/api/mailboxes/status',route(async ctx=>mailboxStatusView(await mailboxOperations.status(ctx),ctx.accountId)));
app.get('/api/sender',route(ctx=>operations.senderStatus(ctx)));
app.post('/api/mailboxes/detect',route((c,i)=>mailboxOperations.detect(c,i)));
app.post('/api/mailboxes/oauth',route((c,i)=>mailboxOperations.startOauth(c,i)));
app.post('/api/mailboxes/connect',mailboxRoute((c,i)=>mailboxOperations.connectMailbox(c,i)));
app.post('/api/mailboxes/verify',mailboxRoute((c,i)=>mailboxOperations.verify(c,i)));
app.post('/api/mailboxes/sync',mailboxRoute((c,i)=>mailboxOperations.syncReplies(c,i)));
app.post('/api/mailboxes/test',mailboxRoute((c,i)=>mailboxOperations.testSend(c,i)));
app.post('/api/mailboxes/disconnect',mailboxRoute((c,i)=>mailboxOperations.disconnect(c,i)));

app.get('/api/settings/connections',route(async ctx=>maskSettings(await accountSettings(ctx.accountId))));
app.post('/api/settings/connections',route((ctx,input)=>saveAccountSettings(ctx.accountId,input)));
app.get('/api/settings/connector',route(async ctx=>({code:await connectorCode(ctx.accountId)})));
app.post('/api/settings/connector',route(async ctx=>({code:await connectorCode(ctx.accountId,true)})));

const superadminOnly=(req:express.Request,res:express.Response,next:express.NextFunction)=>req.account?.role==='superadmin'?next():res.status(403).json({error:'Доступ только для суперадминов'});
app.get('/api/platform',superadminOnly,async(_req,res)=>res.json(maskPlatform(await platformSettings())));
app.post('/api/platform',superadminOnly,async(req,res)=>res.json(await savePlatformSettings(req.body)));
app.get('/api/platform/mail',superadminOnly,(_req,res)=>res.json(systemMailStatus()));
app.post('/api/platform/mail/test',superadminOnly,async(req,res)=>{const to=z.object({to:z.email().optional()}).parse(req.body??{}).to??req.account!.email;res.json(await testSystemMail(to));});
app.get('/api/accounts',superadminOnly,async(_req,res)=>res.json(await listAccounts()));
app.post('/api/accounts/decide',superadminOnly,async(req,res)=>res.json(await decideAccount(req.account!,req.body)));
app.get('/api/accounts/:id/workspace',superadminOnly,async(req,res)=>res.json(await supportView(req.account!,String(req.params.id))));
app.get('/api/support-log',superadminOnly,async(_req,res)=>res.json(await supportLog()));

app.post('/api/campaigns/:id/send',route((c,i)=>operations.send(c,i)));
app.post('/api/domains/:id/limit',route((c,i)=>operations.setDomainLimit(c,i)));
app.post('/api/send',(_req,res)=>res.status(409).json({error:'Отправка выполняется по кампании: POST /api/campaigns/:id/send. Требуются проверенный ящик, суточный лимит домена и подтверждение первой партии.'}));
mountMailboxCallback(app);mountOauth(app);mountMcp(app);
app.use(express.static('dist'));app.get('/{*path}',(_req,res)=>res.sendFile('index.html',{root:'dist'}));
app.use((err:any,_req:any,res:any,_next:any)=>res.status(err instanceof z.ZodError?400:422).json({error:err instanceof z.ZodError?err.issues.map((i:any)=>`${i.path.join('.')}: ${i.message}`).join('; '):err.message}));
const {host,port}=bindAddress(process.env);
await init();app.listen(port,host,()=>console.log(`Sendina API: http://${host}:${port}`));