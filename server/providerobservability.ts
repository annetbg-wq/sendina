import {randomUUID} from 'node:crypto';
import type {ProviderErrorClass} from './providererrors';

export type ProviderEvent={
 correlationId:string;provider:string;operation:string;status:number|null;attempts:number;
 latencyMs:number;errorClass:ProviderErrorClass|null;retried:boolean;
};

type Metric={requests:number;attempts:number;retries:number;errors:number;latencyMs:number};
const metrics=new Map<string,Metric>();

export function providerName(url:string){
 let host='';try{host=new URL(url).hostname.toLowerCase();}catch{return 'unknown';}
 if(host.includes('googleapis.com')||host.includes('google.com'))return 'google';
 if(host.includes('microsoftonline.com')||host.includes('microsoft.com'))return 'microsoft';
 return host||'unknown';
}

export const newCorrelationId=()=>randomUUID();

/** Records one completed provider operation. It intentionally contains no URL, headers, body,
 * email address, token or error detail, so structured logs cannot leak credentials. */
export function recordProviderEvent(event:ProviderEvent){
 const key=`${event.provider}:${event.operation}`;
 const metric=metrics.get(key)??{requests:0,attempts:0,retries:0,errors:0,latencyMs:0};
 metric.requests++;metric.attempts+=event.attempts;metric.retries+=Math.max(0,event.attempts-1);
 if(event.errorClass)metric.errors++;metric.latencyMs+=event.latencyMs;metrics.set(key,metric);
 if(process.env.PROVIDER_STRUCTURED_LOGS!=='0')console.info(JSON.stringify({type:'provider_operation',...event}));
}

export function providerMetricsSnapshot(){
 return [...metrics.entries()].map(([key,value])=>{
  const [provider,operation]=key.split(':');
  return {provider,operation,...value,avgLatencyMs:value.requests?Math.round(value.latencyMs/value.requests):0};
 });
}

/** Test/support helper; production callers do not need to reset process metrics. */
export function resetProviderMetrics(){metrics.clear();}
