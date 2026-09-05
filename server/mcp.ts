import type {Express} from 'express';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createRemoteJWKSet,jwtVerify} from 'jose';
import {z} from 'zod';
import {timingSafeEqual} from 'node:crypto';

export function mountMcp(app:Express){
 const resource=process.env.MCP_RESOURCE_URL??'http://127.0.0.1:3001/mcp';
 const issuer=process.env.OAUTH_ISSUER;
 const jwks=process.env.OAUTH_JWKS_URL?createRemoteJWKSet(new URL(process.env.OAUTH_JWKS_URL)):null;
 app.get(['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'],(_req,res)=>res.json({resource,authorization_servers:issuer?[issuer]:[],scopes_supported:['sendina:read','sendina:write'],bearer_methods_supported:['header'],resource_name:'Sendina'}));
 app.get('/api/integrations',(_req,res)=>res.json({mcp:{endpoint:resource,transport:'Streamable HTTP',authentication:issuer&&jwks?'OAuth 2.1':process.env.MCP_TOKEN?'Development bearer token':'Not configured',ready:Boolean(issuer&&jwks&&process.env.MCP_SUBJECT||process.env.MCP_TOKEN),tools:['get_dashboard','list_campaigns','list_opportunities','get_campaign','create_campaign','import_contacts','preview_campaign','set_campaign_status','emergency_stop','exclude_recipient']}}));
 app.post('/mcp',async(req,res)=>{
  // Tokens are never passed to tools or persisted in the workspace.
  const token=req.headers.authorization?.replace(/^Bearer /,'')??'';
  let scopes:string[]=[];
  try{
   if(issuer&&jwks){const {payload}=await jwtVerify(token,jwks,{issuer,audience:resource,requiredClaims:['exp','sub']});if(!process.env.MCP_SUBJECT||payload.sub!==process.env.MCP_SUBJECT)throw Error('Unbound workspace');scopes=String(payload.scope??'').split(' ');}
   else {const expected=process.env.MCP_TOKEN??'';const a=Buffer.from(token),b=Buffer.from(expected);if(!expected||a.length!==b.length||!timingSafeEqual(a,b))throw Error('Unauthorized');scopes=['sendina:read','sendina:write'];}
  }catch{res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource/mcp',resource)}"`);res.status(401).json({error:'unauthorized'});return;}
  const server=new McpServer({name:'sendina',version:'0.1.0'});
  const invoke=async(path:string,body?:unknown)=>{const r=await fetch(`http://127.0.0.1:${process.env.PORT??3001}/api${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(process.env.APP_TOKEN?{Authorization:`Bearer ${process.env.APP_TOKEN}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
  const register=(name:string,description:string,schema:any,write:boolean,idempotent:boolean,fn:(args:any)=>Promise<any>)=>server.registerTool(name,{description,inputSchema:schema,annotations:{readOnlyHint:!write,destructiveHint:write,idempotentHint:idempotent,openWorldHint:false},_meta:{securitySchemes:[{type:'oauth2',scopes:[write?'sendina:write':'sendina:read']}]}},async(args:any)=>{if(!scopes.includes(write?'sendina:write':'sendina:read'))return {isError:true,content:[{type:'text' as const,text:'Insufficient scope'}]};try{const data=await fn(args);return {content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:{result:data}};}catch(e:any){return {isError:true,content:[{type:'text' as const,text:e.message}]};}});
  register('get_dashboard','Get workspace metrics and readiness. Demo data is explicitly labeled.',{},false,true,async()=>{const s=await invoke('/state');return {demo:s.demo,stopped:s.stopped,campaigns:s.campaigns.length,sent:s.campaigns.reduce((n:number,c:any)=>n+c.sent,0),positive:s.campaigns.reduce((n:number,c:any)=>n+c.positive,0),sendingEnabled:false};});
  register('list_campaigns','List campaigns in the authenticated workspace.',{},false,true,async()=>(await invoke('/state')).campaigns);
  register('list_opportunities','List sample hypotheses; scores are not verified research.',{},false,true,async()=>({demo:true,opportunities:(await invoke('/state')).opportunities}));
  register('get_campaign','Read a campaign, its contacts, draft messages and replies.',{id:z.string()},false,true,async({id})=>{const s=await invoke('/state');const campaign=s.campaigns.find((c:any)=>c.id===id);if(!campaign)throw Error('Campaign not found');return {campaign,contacts:s.contacts.filter((c:any)=>c.campaignId===id),messages:s.messages.filter((c:any)=>c.campaignId===id),replies:s.replies.filter((c:any)=>c.campaignId===id)};});
  register('create_campaign','Create a draft campaign. Never sends email.',{name:z.string().min(3).max(150),market:z.string(),goal:z.string(),context:z.string().min(10).max(5000),event:z.string()},true,false,async args=>invoke('/campaigns',args));
  register('import_contacts','Import documented recipients. Deduplicates per campaign. Supply factual sources and contact basis.',{id:z.string(),contacts:z.array(z.object({email:z.email(),name:z.string(),company:z.string(),source:z.url(),basis:z.string().min(3),reason:z.string().min(10)})).min(1).max(1000)},true,true,async({id,contacts})=>invoke(`/campaigns/${encodeURIComponent(id)}/contacts`,{contacts}));
  register('preview_campaign','Prepare factual draft messages and policy decisions. Does not send.',{id:z.string()},true,true,async({id})=>invoke(`/campaigns/${encodeURIComponent(id)}/preview`,{}));
  register('set_campaign_status','Activate or pause campaign preparation. Actual email delivery is disabled.',{id:z.string(),status:z.enum(['active','paused','draft'])},true,true,async({id,status})=>invoke(`/campaigns/${encodeURIComponent(id)}/status`,{status}));
  register('emergency_stop','Stop all campaigns or lift stop. Lifting stop does not resume campaigns.',{stopped:z.boolean()},true,true,async args=>invoke('/stop',args));
  register('exclude_recipient','Globally exclude a recipient across all campaigns.',{email:z.email()},true,true,async args=>invoke('/suppress',args));
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{void transport.close();void server.close();});
  await server.connect(transport);await transport.handleRequest(req,res,req.body);
 });
 app.all('/mcp',(_req,res)=>res.status(405).set('Allow','POST').json({error:'Method not allowed'}));
}
