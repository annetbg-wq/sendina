/** Resolves where the API listens. A public address is refused without a token. */
export function bindAddress(env:Record<string,string|undefined>){
 const host=env.HOST??(env.RAILWAY_ENVIRONMENT_NAME?'0.0.0.0':'127.0.0.1');
 const loopback=host==='127.0.0.1'||host==='localhost'||host==='::1';
 if(!loopback&&!env.APP_TOKEN)throw Error('APP_TOKEN is required before the API may listen on a public address.');
 return {host,port:Number(env.PORT??3001),loopback};
}
