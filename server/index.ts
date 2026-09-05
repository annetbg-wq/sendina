import 'dotenv/config';
import express from 'express';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {init} from './store';
import {operations} from './operations';
import {mountMcp} from './mcp';
import {mountOauth} from './oauth';
import {bindAddress} from './config';
const app=express();app.use(express.json({limit:'1mb'}));
const origins=new Set(['http://127.0.0.1:5173','http://localhost:5173',`http://127.0.0.1:${process.env.VITE_PORT??5173}`,'http://127.0.0.1:3001',...(process.env.ALLOWED_ORIGINS??'').split(',').filter(Boolean)]);
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.use('/api',(req,res,next)=>{const origin=req.headers.origin;if(origin){if(!origins.has(origin))return res.status(403).json({error:'Недопустимый источник запроса'});res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}if(req.method==='OPTIONS')return res.sendStatus(204);if(process.env.APP_TOKEN){const token=req.headers.authorization?.replace('Bearer ','')??'';const a=Buffer.from(token),b=Buffer.from(process.env.APP_TOKEN);if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({error:'Требуется токен доступа'});}next();});

/** Every route is a thin call into the shared operations layer, the same one MCP uses. */
const route=(fn:(input:any)=>Promise<unknown>,status=200)=>async(req:express.Request,res:express.Response)=>
 res.status(status).json(await fn({...req.body,...req.params}));

app.get('/api/state',route(()=>operations.state()));
app.get('/api/capabilities',route(()=>operations.capabilities()));
app.post('/api/campaigns',route(i=>operations.createCampaign(i),201));
app.post('/api/campaigns/:id/status',route(i=>operations.setCampaignStatus(i)));
app.post('/api/campaigns/:id/contacts',route(i=>operations.importContacts(i)));
app.post('/api/campaigns/:id/find',route(i=>operations.findRecipients(i)));
app.post('/api/campaigns/:id/preview',route(i=>operations.prepareMessages(i)));
app.post('/api/contacts/confirm',route(i=>operations.confirmRecipient(i)));
app.post('/api/stop',route(i=>operations.emergencyStop(i)));
app.post('/api/domains',route(i=>operations.addMailbox(i)));
app.post('/api/domains/:id/check',route(i=>operations.checkDomain(i)));
app.post('/api/replies',route(i=>operations.recordReply(i)));
app.post('/api/suppress',route(i=>operations.suppress(i)));
app.post('/api/settings/recipients',route(i=>operations.setRecipientMode(i)));
app.post('/api/send',(_req,res)=>res.status(409).json({error:'Отправка не подключена. Требуются проверенный почтовый провайдер, версионированные правила юрисдикций и подтверждение первой партии.'}));
mountOauth(app);
mountMcp(app);
app.use(express.static('dist'));app.get('/{*path}',(_req,res)=>res.sendFile('index.html',{root:'dist'}));
app.use((err:any,_req:any,res:any,_next:any)=>res.status(err instanceof z.ZodError?400:422).json({error:err instanceof z.ZodError?err.issues.map((i:any)=>`${i.path.join('.')}: ${i.message}`).join('; '):err.message}));
const {host,port}=bindAddress(process.env);
await init();app.listen(port,host,()=>console.log(`Sendina API: http://${host}:${port}`));
