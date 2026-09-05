/** Resolves where the API listens. A public address is refused without a token. */
export function bindAddress(env:Record<string,string|undefined>){
 const host=env.HOST??(env.RAILWAY_ENVIRONMENT_NAME?'0.0.0.0':'127.0.0.1');
 const loopback=host==='127.0.0.1'||host==='localhost'||host==='::1';
 if(!loopback&&!env.APP_TOKEN)throw Error('APP_TOKEN is required before the API may listen on a public address.');
 return {host,port:Number(env.PORT??3001),loopback};
}

/** True for an address that only the container itself can reach. */
const loopback=(url:string)=>{try{const h=new URL(url).hostname;return h==='127.0.0.1'||h==='localhost'||h==='::1';}catch{return false;}};
/** Where this deployment is reachable. Railway publishes its own domain, so it needs no manual address.
    A hand-set loopback address is a leftover, not an intent, once the platform has published a domain. */
export function publicAddress(env:Record<string,string|undefined>){
 const published=env.RAILWAY_PUBLIC_DOMAIN?`https://${env.RAILWAY_PUBLIC_DOMAIN}`:undefined;
 const candidates=[env.PUBLIC_URL,env.MCP_RESOURCE_URL?.replace(/\/mcp\/?$/,''),published,`http://127.0.0.1:${env.PORT??3001}`];
 for(const candidate of candidates){
  if(!candidate)continue;
  if(published&&loopback(candidate))continue;
  return candidate.replace(/\/$/,'');
 }
 return `http://127.0.0.1:${env.PORT??3001}`;
}
/** The MCP endpoint. A configured value is honoured only if it lives at the public address. */
export function resourceAddress(env:Record<string,string|undefined>){
 const base=publicAddress(env);
 const configured=env.MCP_RESOURCE_URL;
 try{if(configured&&new URL(configured).origin===new URL(base).origin)return configured;}catch{}
 return `${base}/mcp`;
}

/** Where the interface lives. On GitHub Pages that is a different origin from the API. */
export function appAddress(env:Record<string,string|undefined>){
 return (env.APP_URL||publicAddress(env)).replace(/\/$/,'');
}
