import type {Request} from 'express';

/** Where the browser actually addressed this deployment. Behind Railway's proxy the public
    host arrives in x-forwarded-*, so req.protocol/req.host alone describe the container. */
export function requestOrigin(req:Request){
 const header=(name:string)=>{const v=req.headers[name];return (Array.isArray(v)?v[0]:v??'').split(',')[0].trim();};
 const proto=header('x-forwarded-proto')||req.protocol||'http';
 const host=header('x-forwarded-host')||header('host');
 return host?`${proto}://${host}`:'';
}

const originOf=(url:string|undefined)=>{try{return url?new URL(url).origin:'';}catch{return '';}};

/** Origins that may call this API from another address than its own.
    The interface may live on GitHub Pages, so its address is always allowed. */
export function allowedOrigins(env:Record<string,string|undefined>=process.env){
 const port=env.VITE_PORT??5173;
 return new Set([
  `http://127.0.0.1:${port}`,`http://localhost:${port}`,
  'http://127.0.0.1:5173','http://localhost:5173',`http://127.0.0.1:${env.PORT??3001}`,
  originOf(env.APP_URL),originOf(env.PUBLIC_URL),
  ...(env.ALLOWED_ORIGINS??'').split(',').map(s=>s.trim()).filter(Boolean)
 ].filter(Boolean));
}

/** The rule behind every mutating request in the interface.

    A browser sends no Origin on a same-origin GET but always sends one on a same-origin POST.
    An allowlist that does not contain the deployment's own address therefore passes every
    read and refuses every write — which is exactly what "Недопустимый источник запроса" was.
    A request that came back to the address it was served from is same-origin by definition. */
export function originAllowed(origin:string|undefined,req:Request,env:Record<string,string|undefined>=process.env){
 if(!origin)return true;
 if(origin===requestOrigin(req))return true;
 return allowedOrigins(env).has(origin);
}
