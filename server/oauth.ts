import type {Express} from 'express';
import express from 'express';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {generateKeyPair,exportPKCS8,exportJWK,importPKCS8,importJWK,SignJWT,jwtVerify,type CryptoKey,type JWTPayload} from 'jose';
import {getAuth,setAuth} from './authstore';
import {publicAddress} from './config';

/** Built-in OAuth 2.1 authorization server: PKCE, dynamic client registration, signed access tokens. */
export const publicUrl=()=>publicAddress(process.env);
export const resourceUrl=()=>process.env.MCP_RESOURCE_URL??`${publicUrl()}/mcp`;
/** An external issuer wins; otherwise the built-in server runs whenever an operator token exists. */
export const oauthEnabled=()=>!process.env.OAUTH_ISSUER&&Boolean(process.env.APP_TOKEN);
export const oauthSubject=()=>process.env.MCP_SUBJECT??'sendina-workspace';

type Client={client_id:string;client_name:string;redirect_uris:string[];registered:string};
type Grant={client_id:string;redirect_uri:string;challenge:string;scope:string;expires:number};
const codes=new Map<string,Grant>();

let keyPromise:Promise<{privateKey:CryptoKey;publicKey:CryptoKey;jwk:Record<string,string>;kid:string}>|null=null;
function keys(){
 return keyPromise??=(async()=>{
  let stored=await getAuth<{pkcs8:string;kid:string}>('signing-key');
  if(!stored){
   const {privateKey}=await generateKeyPair('RS256',{extractable:true});
   stored={pkcs8:await exportPKCS8(privateKey),kid:randomUUID()};
   await setAuth('signing-key',stored);
  }
  const privateKey=await importPKCS8(stored.pkcs8,'RS256',{extractable:true});
  const full=await exportJWK(privateKey);
  // Only the public halves leave this function; the private material never reaches JWKS.
  const jwk={kty:String(full.kty),n:String(full.n),e:String(full.e),alg:'RS256',use:'sig',kid:stored.kid};
  const publicKey=await importJWK({kty:full.kty,n:full.n,e:full.e,alg:'RS256'},'RS256') as CryptoKey;
  return {privateKey,publicKey,jwk,kid:stored.kid};
 })();
}

const same=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const clients=async()=>(await getAuth<Record<string,Client>>('clients'))??{};

export async function issueAccessToken(scope:string,ttl=3600){
 const {privateKey,kid}=await keys();
 return new SignJWT({scope}).setProtectedHeader({alg:'RS256',kid})
  .setIssuer(publicUrl()).setAudience(resourceUrl()).setSubject(oauthSubject())
  .setIssuedAt().setExpirationTime(`${ttl}s`).setJti(randomUUID()).sign(privateKey);
}
/** Verifies a token this server issued, without a network round trip to its own JWKS. */
export async function verifyLocalToken(token:string):Promise<JWTPayload>{
 const {publicKey}=await keys();
 const {payload}=await jwtVerify(token,publicKey,{issuer:publicUrl(),audience:resourceUrl(),requiredClaims:['exp','sub']});
 if(payload.sub!==oauthSubject())throw Error('Unbound workspace');
 return payload;
}

const strings={
 ru:{title:'Доступ к рабочей области',lead:'Клиент запрашивает доступ к Sendina. Подтвердите его токеном доступа рабочей области.',
  token:'Токен доступа',grant:'Разрешить доступ',scope:'Запрошенные права',wrong:'Неверный токен доступа',
  read:'чтение кампаний, адресатов, писем и ответов',write:'создание кампаний, поиск адресатов и подготовка писем'},
 en:{title:'Workspace access',lead:'A client is requesting access to Sendina. Confirm it with your workspace access token.',
  token:'Access token',grant:'Grant access',scope:'Requested permissions',wrong:'Wrong access token',
  read:'read campaigns, recipients, messages and replies',write:'create campaigns, find recipients and prepare messages'}
};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const page=(lang:'ru'|'en',params:Record<string,string>,client:Client,error?:string)=>{
 const t=strings[lang];const scopes=(params.scope||'sendina:read').split(' ');
 return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${t.title} — Sendina</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f9fc;font:14px/1.6 system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#182133;padding:24px}
.card{background:#fff;border:1px solid #e3e9f3;border-radius:14px;padding:32px;width:420px;max-width:100%;box-shadow:0 18px 60px #1b2b4a14}
h1{font-size:19px;letter-spacing:-.4px;margin:0 0 10px}p{color:#7d8798;font-size:13px;margin:0 0 18px}
b.app{color:#182133}ul{margin:0 0 20px;padding-left:18px;color:#5b6577;font-size:13px}
label{display:block;font-size:12px;font-weight:700;margin-bottom:8px}
input{width:100%;box-sizing:border-box;border:1px solid #dce2ec;border-radius:7px;padding:11px 12px;font:inherit}
input:focus{outline:none;border-color:#4877f0;box-shadow:0 0 0 3px #2459ed1f}
button{margin-top:18px;width:100%;background:#2459ed;color:#fff;border:0;border-radius:7px;padding:12px;font:inherit;font-weight:700;cursor:pointer}
.err{background:#fff0f0;border:1px solid #f5dada;color:#b34343;border-radius:7px;padding:10px 12px;font-size:13px;margin-bottom:16px}</style></head>
<body><form class="card" method="post" action="/oauth/authorize">
<h1>${t.title}</h1><p><b class="app">${escape(client.client_name)}</b> — ${t.lead}</p>
${error?`<div class="err">${escape(error)}</div>`:''}
<strong style="font-size:12px">${t.scope}</strong>
<ul>${scopes.includes('sendina:write')?`<li>${t.write}</li>`:''}<li>${t.read}</li></ul>
${Object.entries(params).map(([k,v])=>`<input type="hidden" name="${escape(k)}" value="${escape(v)}"/>`).join('')}
<label for="token">${t.token}</label><input id="token" name="operator_token" type="password" autofocus required/>
<button type="submit">${t.grant}</button></form></body></html>`;
};

export function mountOauth(app:Express){
 const form=express.urlencoded({extended:false});
 app.get(['/.well-known/oauth-authorization-server','/.well-known/oauth-authorization-server/mcp'],(_req,res)=>{
  if(!oauthEnabled())return res.status(404).json({error:'not_found'});
  const base=publicUrl();
  res.json({issuer:base,authorization_endpoint:`${base}/oauth/authorize`,token_endpoint:`${base}/oauth/token`,
   registration_endpoint:`${base}/oauth/register`,jwks_uri:`${base}/oauth/jwks`,
   scopes_supported:['sendina:read','sendina:write'],response_types_supported:['code'],
   grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],
   token_endpoint_auth_methods_supported:['none']});
 });
 app.get('/oauth/jwks',async(_req,res)=>{
  if(!oauthEnabled())return res.status(404).json({error:'not_found'});
  res.json({keys:[(await keys()).jwk]});
 });
 app.post('/oauth/register',async(req,res)=>{
  if(!oauthEnabled())return res.status(404).json({error:'not_found'});
  const uris=Array.isArray(req.body?.redirect_uris)?req.body.redirect_uris.filter((u:unknown)=>typeof u==='string'):[];
  if(!uris.length)return res.status(400).json({error:'invalid_redirect_uri'});
  for(const u of uris){try{const parsed=new URL(u);if(parsed.protocol!=='https:'&&parsed.hostname!=='127.0.0.1'&&parsed.hostname!=='localhost')throw Error('insecure');}catch{return res.status(400).json({error:'invalid_redirect_uri'});}}
  const client:Client={client_id:randomUUID(),client_name:String(req.body?.client_name??'MCP client').slice(0,80),redirect_uris:uris,registered:new Date().toISOString()};
  const all=await clients();all[client.client_id]=client;await setAuth('clients',all);
  res.status(201).json({client_id:client.client_id,client_name:client.client_name,redirect_uris:uris,
   token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']});
 });
 const language=(req:express.Request):'ru'|'en'=>String(req.headers['accept-language']??'').toLowerCase().includes('ru')?'ru':'en';
 const collect=(q:any)=>({client_id:String(q.client_id??''),redirect_uri:String(q.redirect_uri??''),state:String(q.state??''),
  scope:String(q.scope??'sendina:read sendina:write'),code_challenge:String(q.code_challenge??''),code_challenge_method:String(q.code_challenge_method??'')});
 app.get('/oauth/authorize',async(req,res)=>{
  if(!oauthEnabled())return res.status(404).json({error:'not_found'});
  const p=collect(req.query);const client=(await clients())[p.client_id];
  if(!client||!client.redirect_uris.includes(p.redirect_uri))return res.status(400).json({error:'invalid_client'});
  if(p.code_challenge_method!=='S256'||!p.code_challenge)return res.status(400).json({error:'invalid_request',error_description:'PKCE S256 required'});
  res.type('html').send(page(language(req),p,client));
 });
 app.post('/oauth/authorize',form,async(req,res)=>{
  if(!oauthEnabled())return res.status(404).json({error:'not_found'});
  const p=collect(req.body);const client=(await clients())[p.client_id];
  if(!client||!client.redirect_uris.includes(p.redirect_uri))return res.status(400).json({error:'invalid_client'});
  if(p.code_challenge_method!=='S256'||!p.code_challenge)return res.status(400).json({error:'invalid_request'});
  const lang=language(req);
  if(!same(String(req.body?.operator_token??''),process.env.APP_TOKEN??''))
   return res.status(401).type('html').send(page(lang,p,client,strings[lang].wrong));
  const code=randomBytes(32).toString('base64url');
  codes.set(code,{client_id:p.client_id,redirect_uri:p.redirect_uri,challenge:p.code_challenge,scope:p.scope,expires:Date.now()+600000});
  const target=new URL(p.redirect_uri);target.searchParams.set('code',code);
  if(p.state)target.searchParams.set('state',p.state);
  res.redirect(target.toString());
 });
 app.post('/oauth/token',form,async(req,res)=>{
  if(!oauthEnabled())return res.status(404).json({error:'not_found'});
  const body={...req.body};
  const grantType=String(body.grant_type??'');
  if(grantType==='refresh_token'){
   const store=(await getAuth<Record<string,{client_id:string;scope:string}>>('refresh'))??{};
   const entry=store[String(body.refresh_token??'')];
   if(!entry||entry.client_id!==String(body.client_id??''))return res.status(400).json({error:'invalid_grant'});
   return res.json({access_token:await issueAccessToken(entry.scope),token_type:'Bearer',expires_in:3600,scope:entry.scope,refresh_token:String(body.refresh_token)});
  }
  if(grantType!=='authorization_code')return res.status(400).json({error:'unsupported_grant_type'});
  const grant=codes.get(String(body.code??''));
  codes.delete(String(body.code??''));
  if(!grant||grant.expires<Date.now())return res.status(400).json({error:'invalid_grant'});
  if(grant.client_id!==String(body.client_id??'')||grant.redirect_uri!==String(body.redirect_uri??''))return res.status(400).json({error:'invalid_grant'});
  const verifier=String(body.code_verifier??'');
  if(createHash('sha256').update(verifier).digest('base64url')!==grant.challenge)return res.status(400).json({error:'invalid_grant',error_description:'PKCE verification failed'});
  const refresh=randomBytes(32).toString('base64url');
  const store=(await getAuth<Record<string,{client_id:string;scope:string}>>('refresh'))??{};
  store[refresh]={client_id:grant.client_id,scope:grant.scope};await setAuth('refresh',store);
  res.json({access_token:await issueAccessToken(grant.scope),token_type:'Bearer',expires_in:3600,scope:grant.scope,refresh_token:refresh});
 });
}
