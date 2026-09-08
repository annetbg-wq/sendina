export type ProviderErrorClass='REAUTH_REQUIRED'|'RATE_LIMITED'|'RETRYABLE'|'PERMANENT'|'UNKNOWN';
export type ProviderError={class:ProviderErrorClass;code:string;status:number|null;retryAfterMs:number|null;detail:string};

const textOf=(e:any)=>String(e?.detail??e?.message??e?.body??e??'');
const statusOf=(e:any):number|null=>{
 const value=Number(e?.status??e?.statusCode??e?.response?.status);
 return Number.isFinite(value)&&value>0?value:null;
};
const headerOf=(e:any,name:string):string=>{
 const headers=e?.headers??e?.response?.headers;
 if(!headers)return '';
 if(typeof headers.get==='function')return String(headers.get(name)??'');
 const key=Object.keys(headers).find(k=>k.toLowerCase()===name.toLowerCase());
 return key?String(headers[key]):'';
};

export function retryAfterMs(value:string,now=Date.now()):number|null{
 const raw=value.trim();if(!raw)return null;
 if(/^\d+$/.test(raw))return Math.max(0,Number(raw)*1000);
 const date=Date.parse(raw);return Number.isFinite(date)?Math.max(0,date-now):null;
}

/** Provider-specific HTTP/token/socket failures become one small vocabulary for recovery logic. */
export function normalizeProviderError(e:any):ProviderError{
 const detail=textOf(e).slice(0,500);
 const lower=detail.toLowerCase();
 const status=statusOf(e);
 const code=String(e?.code??e?.error??e?.errorCode??status??'UNKNOWN');
 const after=retryAfterMs(headerOf(e,'retry-after'));

 if(status===401||/invalid_grant|invalid token|token.*expired|reauth|authentication required/.test(lower))
  return {class:'REAUTH_REQUIRED',code,status,retryAfterMs:null,detail};
 if(status===429||/rate.?limit|too many requests|quota exceeded/.test(lower))
  return {class:'RATE_LIMITED',code,status,retryAfterMs:after,detail};
 if([408,425,500,502,503,504].includes(status??0)||
    ['ETIMEDOUT','ESOCKETTIMEDOUT','ECONNRESET','EAI_AGAIN','ENETUNREACH'].includes(code)||
    /temporar|timeout|connection reset|service unavailable/.test(lower))
  return {class:'RETRYABLE',code,status,retryAfterMs:after,detail};
 if(status!==null&&status>=400&&status<500)
  return {class:'PERMANENT',code,status,retryAfterMs:null,detail};
 return {class:'UNKNOWN',code,status,retryAfterMs:after,detail};
}

/** Exponential backoff with bounded jitter; Retry-After always wins when the provider supplies it. */
export function retryDelayMs(attempt:number,error:ProviderError,random=Math.random):number|null{
 if(!['RATE_LIMITED','RETRYABLE'].includes(error.class))return null;
 if(error.retryAfterMs!==null)return Math.min(error.retryAfterMs,15*60*1000);
 const base=Math.min(1000*2**Math.max(0,attempt),60_000);
 const jitter=0.75+Math.max(0,Math.min(1,random()))*0.5;
 return Math.round(base*jitter);
}

export function shouldRetry(error:ProviderError,attempt:number,maxAttempts=4){
 return attempt<maxAttempts-1&&retryDelayMs(attempt,error,()=>0.5)!==null;
}
