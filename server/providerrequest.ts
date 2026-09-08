import {normalizeProviderError,retryDelayMs,type ProviderError} from './providererrors';

export type RequestMode='read'|'token'|'exchange'|'send';
export class ProviderRequestError extends Error{
 readonly provider:ProviderError;
 constructor(provider:ProviderError){super(provider.detail||provider.code);this.name='ProviderRequestError';this.provider=provider;}
}

type Options={mode:RequestMode;maxAttempts?:number;fetchFn?:typeof fetch;sleep?:(ms:number)=>Promise<void>;random?:()=>number};
const defaultSleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));

function retryAllowed(mode:RequestMode,error:ProviderError){
 if(mode==='read'||mode==='token')return error.class==='RATE_LIMITED'||error.class==='RETRYABLE';
 // Authorization-code exchange may have consumed the one-time code even when its response was lost.
 if(mode==='exchange')return error.class==='RATE_LIMITED';
 // A send can be accepted before a 5xx/socket ambiguity. Only an explicit 429 is safe to repeat.
 return error.class==='RATE_LIMITED';
}

/** HTTPS provider request with bounded retries that never guesses through an ambiguous send. */
export async function providerRequest(url:string,init:RequestInit,options:Options):Promise<Response>{
 const fetchFn=options.fetchFn??fetch;
 const sleep=options.sleep??defaultSleep;
 const random=options.random??Math.random;
 const max=Math.max(1,options.maxAttempts??4);
 let last:ProviderError|null=null;
 for(let attempt=0;attempt<max;attempt++){
  try{
   const response=await fetchFn(url,init);
   if(response.ok)return response;
   const detail=(await response.text()).slice(0,500);
   const error=normalizeProviderError({status:response.status,headers:response.headers,message:detail||response.statusText});
   last=error;
   const delay=retryAllowed(options.mode,error)&&attempt<max-1?retryDelayMs(attempt,error,random):null;
   if(delay===null)throw new ProviderRequestError(error);
   await sleep(delay);
  }catch(e:any){
   if(e instanceof ProviderRequestError)throw e;
   const error=normalizeProviderError(e);last=error;
   const delay=retryAllowed(options.mode,error)&&attempt<max-1?retryDelayMs(attempt,error,random):null;
   if(delay===null)throw new ProviderRequestError(error);
   await sleep(delay);
  }
 }
 throw new ProviderRequestError(last??normalizeProviderError(new Error('Provider request failed')));
}
