import type {Express} from 'express';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {z} from 'zod';
import {timingSafeEqual} from 'node:crypto';
import {operations} from './operations';
import {countries,regions} from './geo';
import {RESULTS} from './research';
import {mailboxOperations} from './mailboxes';
import {oauthEnabled,publicUrl,resourceUrl,verifyLocalToken} from './oauth';
import {findAccount,ensureAccount} from './accounts';
import type {Ctx} from './context';

/** MCP tools call the same operations layer as the UI, in process. Nothing goes back over HTTP. */
export function mountMcp(app:Express){
 const issuer=process.env.OAUTH_ISSUER;
 const jwks=process.env.OAUTH_JWKS_URL?createRemoteJWKSet(new URL(process.env.OAUTH_JWKS_URL)):null;
 const authorizationServers=()=>oauthEnabled()?[publicUrl()]:issuer?[issuer]:[];
 const method=()=>oauthEnabled()?'OAuth 2.1':issuer&&jwks?'OAuth 2.1 (внешний провайдер)':process.env.MCP_TOKEN?'Токен разработчика':'Не настроено';
 const tools=['get_capabilities','get_dashboard','list_campaigns','get_campaign','create_campaign','find_recipients','import_contacts','confirm_recipient','prepare_messages','launch_preview','set_control_mode','approve_first_batch','set_campaign_status','record_reply','exclude_recipient','emergency_stop','list_mailboxes','verify_mailbox','sync_replies','test_mailbox','research_opportunities','list_opportunities','research_markets_by_country','research_markets_by_niche','assess_market','list_markets','save_favourite','remove_favourite','create_test_from_research','list_threads','get_thread','set_thread_action','get_analytics','list_locations'];

 app.get(['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'],(_req,res)=>
  res.json({resource:resourceUrl(),authorization_servers:authorizationServers(),scopes_supported:['sendina:read','sendina:write'],bearer_methods_supported:['header'],resource_name:'Sendina'}));

 app.get('/api/integrations',async(req,res)=>{
  if(!req.ctx)return res.status(401).json({error:'Требуется вход'});
  res.json({mcp:{endpoint:resourceUrl(),transport:'Streamable HTTP',
   authentication:method(),ready:oauthEnabled()||Boolean(issuer&&jwks&&process.env.MCP_SUBJECT)||Boolean(process.env.MCP_TOKEN),
   builtInOauth:oauthEnabled(),authorizationServer:authorizationServers()[0]??'',tools},
   capabilities:await operations.capabilities(req.ctx)});
 });

 app.post('/mcp',async(req,res)=>{
  // Tokens are never passed to tools or persisted in the workspace.
  const token=req.headers.authorization?.replace(/^Bearer /,'')??'';
  let scopes:string[]|null=null;
  let ctx:Ctx|null=null;
  // Each configured method is tried in turn; the first one that accepts the token wins.
  const attempts:(()=>Promise<{scopes:string[];ctx:Ctx}>)[]=[];
  const contextFor=async(accountId:string)=>{
   const account=await findAccount(accountId);
   if(!account||account.status!=='approved')throw Error('Unknown or unapproved account');
   return {accountId:account.id,email:account.email,role:account.role} as Ctx;
  };
  if(oauthEnabled())attempts.push(async()=>{
   const payload=await verifyLocalToken(token);
   return {scopes:String(payload.scope??'').split(' '),ctx:await contextFor(String(payload.sub))};});
  if(issuer&&jwks)attempts.push(async()=>{
   const {payload}=await jwtVerify(token,jwks,{issuer,audience:resourceUrl(),requiredClaims:['exp','sub']});
   if(!process.env.MCP_SUBJECT||payload.sub!==process.env.MCP_SUBJECT)throw Error('Unbound workspace');
   const account=await ensureAccount(process.env.MCP_ACCOUNT_EMAIL??'');
   return {scopes:String(payload.scope??'').split(' '),ctx:{accountId:account.id,email:account.email,role:account.role}};});
  if(process.env.MCP_TOKEN)attempts.push(async()=>{
   const expected=process.env.MCP_TOKEN!;const a=Buffer.from(token),b=Buffer.from(expected);
   if(a.length!==b.length||!timingSafeEqual(a,b))throw Error('Unauthorized');
   const account=await ensureAccount(process.env.MCP_ACCOUNT_EMAIL??'');
   return {scopes:['sendina:read','sendina:write'],ctx:{accountId:account.id,email:account.email,role:account.role}};});
  for(const attempt of attempts){try{const result=await attempt();scopes=result.scopes;ctx=result.ctx;break;}catch{}}
  if(!scopes||!ctx){
   res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource/mcp',resourceUrl())}"`);
   res.status(401).json({error:'unauthorized'});return;
  }
  const account=ctx;
  const server=new McpServer({name:'sendina',version:'0.2.0'});
  const register=(name:string,description:string,schema:any,write:boolean,idempotent:boolean,fn:(args:any)=>Promise<any>)=>
   server.registerTool(name,{description,inputSchema:schema,
    annotations:{readOnlyHint:!write,destructiveHint:write,idempotentHint:idempotent,openWorldHint:false},
    _meta:{securitySchemes:[{type:'oauth2',scopes:[write?'sendina:write':'sendina:read']}]}},
    async(args:any)=>{
     if(!scopes.includes(write?'sendina:write':'sendina:read'))return {isError:true,content:[{type:'text' as const,text:'Insufficient scope'}]};
     try{const data=await fn(args);return {content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:{result:data}};}
     catch(e:any){return {isError:true,content:[{type:'text' as const,text:e.message}]};}
    });

  register('get_capabilities','Which model, search provider and recipient mode this workspace uses.',{},false,true,()=>operations.capabilities(account));
  register('get_dashboard','Workspace metrics: campaigns, recipients, messages, replies and readiness.',{},false,true,()=>operations.dashboard(account));
  register('list_campaigns','List campaigns in the authenticated workspace.',{},false,true,()=>operations.listCampaigns(account));
  register('get_campaign','Read a campaign with its recipients, drafts, replies and duplicate addresses.',{id:z.string()},false,true,a=>operations.getCampaign(account,a));
  register('create_campaign','Create a draft campaign. Never sends email.',
   {name:z.string().min(3).max(150),market:z.string(),goal:z.string(),context:z.string().min(10).max(5000),event:z.string()},true,false,a=>operations.createCampaign(account,a));
  register('find_recipients','Find candidate recipients with source, basis and a concrete contact reason. Addresses that are not present in a real source stay unverified and cannot be sent.',
   {id:z.string(),count:z.number().int().min(1).max(50).optional(),mode:z.enum(['auto','search','proposal']).optional()},true,false,a=>operations.findRecipients(account,a));
  register('import_contacts','Secondary route: import documented recipients as JSON. Deduplicates per campaign.',
   {id:z.string(),contacts:z.array(z.object({email:z.email(),name:z.string(),company:z.string(),source:z.url(),basis:z.string().min(3),reason:z.string().min(10)})).min(1).max(1000)},true,true,a=>operations.importContacts(account,a));
  register('confirm_recipient','Confirm a proposed recipient with a real address, source and evidence, so policy may allow it.',
   {contactId:z.string(),email:z.email(),source:z.url(),evidence:z.string().min(10)},true,true,a=>operations.confirmRecipient(account,a));
  register('prepare_messages','Prepare drafts with the contact reason and a policy decision for each recipient. Does not send.',
   {id:z.string(),limit:z.number().int().min(1).max(50).optional()},true,true,a=>operations.prepareMessages(account,a));
  register('launch_preview','The sample an operator reviews before launch: real recipients with organisation, role, source, evidence, reason and the letter each would receive.',
   {id:z.string(),limit:z.number().int().min(1).max(50).optional()},true,true,a=>operations.launchPreview(account,a));
  register('set_control_mode','How much of the first sending must be approved by hand: auto, confirm the first batch, or fully manual.',
   {id:z.string(),control:z.enum(['auto','confirm','manual'])},true,true,a=>operations.setControlMode(account,a));
  register('approve_first_batch','Approve the reviewed first batch, which is what lifts FIRST_BATCH_APPROVAL_REQUIRED.',
   {id:z.string()},true,true,a=>operations.approveFirstBatch(account,a));
  register('set_campaign_status','Activate or pause a campaign. Activating re-checks for repeated addresses.',
   {id:z.string(),status:z.enum(['active','paused','draft'])},true,true,a=>operations.setCampaignStatus(account,a));
  register('record_reply','Record an inbound reply. Repeating the same eventId never duplicates it.',
   {campaignId:z.string(),email:z.email(),text:z.string().min(1),eventId:z.string(),
    category:z.enum(['positive','neutral','objection','referral','later','unsubscribe','negative','automatic','bounce'])},true,true,a=>operations.recordReply(account,a));
  register('exclude_recipient','Globally exclude a recipient across all campaigns.',{email:z.email()},true,true,a=>operations.suppress(account,a));
  register('list_mailboxes','Sending readiness of every domain and mailbox, with what is still missing.',{},false,true,()=>mailboxOperations.status(account));
  register('verify_mailbox','Re-run the full mailbox proof: credential, test send, incoming channel, and reading that message back.',
   {email:z.email()},true,false,a=>mailboxOperations.verify(account,a));
  register('sync_replies','Pull replies from a connected mailbox and file them against their campaign and recipient.',
   {email:z.email(),limit:z.number().int().min(1).max(100).optional()},true,true,a=>mailboxOperations.syncReplies(account,a));
  register('test_mailbox','Send one real test message through a connected mailbox. Readiness depends on it.',
   {email:z.email(),to:z.email().optional()},true,false,a=>mailboxOperations.testSend(account,a));
  register('emergency_stop','Stop all campaigns or lift the stop. Lifting does not resume campaigns.',{stopped:z.boolean()},true,true,a=>operations.emergencyStop(account,a));

  // Research, favourites, threads and analytics reach the same operations the screens call, so a
  // search started in a chat is the search the "Возможности" screen shows, with the same ids.
  const location={countries:z.array(z.string()).optional(),region:z.string().optional(),
   city:z.string().optional(),auto:z.boolean().optional()};
  register('list_locations','Countries and regions a campaign or a search may target.',{},false,true,
   async()=>({countries,regions}));
  register('research_opportunities',`Find exactly ${RESULTS} current opportunities for a location and an industry. Replaces the previous opportunity search in this workspace, which is what the Opportunities screen then shows.`,
   {location:z.object(location).optional(),industry:z.string().optional(),note:z.string().optional()},
   true,false,a=>operations.researchOpportunities(account,a));
  register('list_opportunities','The current opportunity search and the kept favourites of this workspace.',{},false,true,
   ()=>operations.listOpportunities(account));
  register('research_markets_by_country',`Given a country, region or city, return the ${RESULTS} most promising niches for it.`,
   {location:z.object(location)},true,false,a=>operations.researchMarkets(account,{...a,mode:'country'}));
  register('research_markets_by_niche',`Given a niche, product or direction, return the ${RESULTS} most promising countries or regions for it.`,
   {niche:z.string()},true,false,a=>operations.researchMarkets(account,{...a,mode:'niche'}));
  register('assess_market','Score one chosen combination of location and niche, without proposing alternatives.',
   {location:z.object(location),niche:z.string()},true,false,a=>operations.researchMarkets(account,{...a,mode:'manual'}));
  register('list_markets','The current market research and the kept market favourites.',{},false,true,
   ()=>operations.listMarkets(account));
  register('save_favourite','Keep one researched opportunity or market. Nothing is kept automatically.',
   {id:z.string()},true,true,a=>operations.saveFavourite(account,a));
  register('remove_favourite','Remove one kept opportunity or market.',{id:z.string()},true,true,
   a=>operations.removeFavourite(account,a));
  register('create_test_from_research','Create an ordinary draft campaign from a researched opportunity or market, whether it is in the current results or in the favourites.',
   {id:z.string(),control:z.enum(['auto','confirm','manual']).optional()},true,false,
   a=>operations.createTestFromResearch(account,a));
  register('list_threads','One entry per recipient: the last reply, the classification, the status and the recommended next action.',
   {},false,true,()=>operations.threads(account));
  register('get_thread','The whole conversation with one recipient: every outgoing letter, every reply, in order.',
   {email:z.email()},false,true,async(a:any)=>{
    const all=await operations.threads(account) as any;
    const thread=all.threads.find((t:any)=>t.email===String(a.email).toLowerCase());
    if(!thread)throw Error('Переписки с этим адресатом нет');
    return thread;});
  register('set_thread_action','Record how a conversation ended and whether the recommended next action was carried out.',
   {email:z.email(),done:z.boolean().optional(),
    outcome:z.enum(['meeting','documents','interest','later','refused','unsubscribed','bounced','none','other']).optional()},
   true,true,a=>operations.setThreadAction(account,a));
  register('get_analytics','Workspace metrics for a period and a campaign selection, with the change against the previous period of the same length.',
   {period:z.enum(['today','yesterday','7d','30d','90d','all','custom']).optional(),
    from:z.string().optional(),to:z.string().optional(),campaign:z.string().optional()},
   false,true,a=>operations.analytics(account,a));

  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{void transport.close();void server.close();});
  await server.connect(transport);await transport.handleRequest(req,res,req.body);
 });
 app.all('/mcp',(_req,res)=>res.status(405).set('Allow','POST').json({error:'Method not allowed'}));
}
