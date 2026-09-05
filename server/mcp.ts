import type {Express} from 'express';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {z} from 'zod';
import {timingSafeEqual} from 'node:crypto';
import {operations} from './operations';
import {oauthEnabled,publicUrl,resourceUrl,verifyLocalToken} from './oauth';

/** MCP tools call the same operations layer as the UI, in process. Nothing goes back over HTTP. */
export function mountMcp(app:Express){
 const issuer=process.env.OAUTH_ISSUER;
 const jwks=process.env.OAUTH_JWKS_URL?createRemoteJWKSet(new URL(process.env.OAUTH_JWKS_URL)):null;
 const authorizationServers=()=>oauthEnabled()?[publicUrl()]:issuer?[issuer]:[];
 const method=()=>oauthEnabled()?'OAuth 2.1':issuer&&jwks?'OAuth 2.1 (внешний провайдер)':process.env.MCP_TOKEN?'Токен разработчика':'Не настроено';
 const tools=['get_capabilities','get_dashboard','list_campaigns','get_campaign','create_campaign','find_recipients','import_contacts','confirm_recipient','prepare_messages','set_campaign_status','record_reply','exclude_recipient','emergency_stop','list_opportunities'];

 app.get(['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'],(_req,res)=>
  res.json({resource:resourceUrl(),authorization_servers:authorizationServers(),scopes_supported:['sendina:read','sendina:write'],bearer_methods_supported:['header'],resource_name:'Sendina'}));

 app.get('/api/integrations',async(_req,res)=>res.json({mcp:{endpoint:resourceUrl(),transport:'Streamable HTTP',
  authentication:method(),ready:oauthEnabled()||Boolean(issuer&&jwks&&process.env.MCP_SUBJECT)||Boolean(process.env.MCP_TOKEN),
  builtInOauth:oauthEnabled(),authorizationServer:authorizationServers()[0]??'',tools},capabilities:await operations.capabilities()}));

 app.post('/mcp',async(req,res)=>{
  // Tokens are never passed to tools or persisted in the workspace.
  const token=req.headers.authorization?.replace(/^Bearer /,'')??'';
  let scopes:string[]|null=null;
  // Each configured method is tried in turn; the first one that accepts the token wins.
  const attempts:(()=>Promise<string[]>)[]=[];
  if(oauthEnabled())attempts.push(async()=>String((await verifyLocalToken(token)).scope??'').split(' '));
  if(issuer&&jwks)attempts.push(async()=>{const {payload}=await jwtVerify(token,jwks,{issuer,audience:resourceUrl(),requiredClaims:['exp','sub']});
   if(!process.env.MCP_SUBJECT||payload.sub!==process.env.MCP_SUBJECT)throw Error('Unbound workspace');
   return String(payload.scope??'').split(' ');});
  if(process.env.MCP_TOKEN)attempts.push(async()=>{const expected=process.env.MCP_TOKEN!;const a=Buffer.from(token),b=Buffer.from(expected);
   if(a.length!==b.length||!timingSafeEqual(a,b))throw Error('Unauthorized');
   return ['sendina:read','sendina:write'];});
  for(const attempt of attempts){try{scopes=await attempt();break;}catch{}}
  if(!scopes){
   res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource/mcp',resourceUrl())}"`);
   res.status(401).json({error:'unauthorized'});return;
  }
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

  register('get_capabilities','Which model, search provider and recipient mode this workspace uses.',{},false,true,()=>operations.capabilities());
  register('get_dashboard','Workspace metrics: campaigns, recipients, messages, replies and readiness.',{},false,true,()=>operations.dashboard());
  register('list_campaigns','List campaigns in the authenticated workspace.',{},false,true,()=>operations.listCampaigns());
  register('list_opportunities','List sample hypotheses; scores are not verified research.',{},false,true,()=>operations.listOpportunities());
  register('get_campaign','Read a campaign with its recipients, drafts, replies and duplicate addresses.',{id:z.string()},false,true,a=>operations.getCampaign(a));
  register('create_campaign','Create a draft campaign. Never sends email.',
   {name:z.string().min(3).max(150),market:z.string(),goal:z.string(),context:z.string().min(10).max(5000),event:z.string()},true,false,a=>operations.createCampaign(a));
  register('find_recipients','Find candidate recipients with source, basis and a concrete contact reason. Addresses that are not present in a real source stay unverified and cannot be sent.',
   {id:z.string(),count:z.number().int().min(1).max(50).optional(),mode:z.enum(['auto','search','proposal']).optional()},true,false,a=>operations.findRecipients(a));
  register('import_contacts','Secondary route: import documented recipients as JSON. Deduplicates per campaign.',
   {id:z.string(),contacts:z.array(z.object({email:z.email(),name:z.string(),company:z.string(),source:z.url(),basis:z.string().min(3),reason:z.string().min(10)})).min(1).max(1000)},true,true,a=>operations.importContacts(a));
  register('confirm_recipient','Confirm a proposed recipient with a real address, source and evidence, so policy may allow it.',
   {contactId:z.string(),email:z.email(),source:z.url(),evidence:z.string().min(10)},true,true,a=>operations.confirmRecipient(a));
  register('prepare_messages','Prepare drafts with the contact reason and a policy decision for each recipient. Does not send.',
   {id:z.string(),limit:z.number().int().min(1).max(50).optional()},true,true,a=>operations.prepareMessages(a));
  register('set_campaign_status','Activate or pause a campaign. Activating re-checks for repeated addresses.',
   {id:z.string(),status:z.enum(['active','paused','draft'])},true,true,a=>operations.setCampaignStatus(a));
  register('record_reply','Record an inbound reply. Repeating the same eventId never duplicates it.',
   {campaignId:z.string(),email:z.email(),text:z.string().min(1),eventId:z.string(),
    category:z.enum(['positive','neutral','objection','referral','later','unsubscribe','negative','automatic','bounce'])},true,true,a=>operations.recordReply(a));
  register('exclude_recipient','Globally exclude a recipient across all campaigns.',{email:z.email()},true,true,a=>operations.suppress(a));
  register('emergency_stop','Stop all campaigns or lift the stop. Lifting does not resume campaigns.',{stopped:z.boolean()},true,true,a=>operations.emergencyStop(a));

  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{void transport.close();void server.close();});
  await server.connect(transport);await transport.handleRequest(req,res,req.body);
 });
 app.all('/mcp',(_req,res)=>res.status(405).set('Allow','POST').json({error:'Method not allowed'}));
}
