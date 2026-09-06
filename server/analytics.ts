import type {State} from './seed';

/** Analytics over the real events of one workspace.

    Two filters decide everything the screen shows: a period and a campaign selection. Both are
    applied here, once, so a table, a chart and a headline number can never disagree — and so a
    period change is a different query rather than the same numbers relabelled.

    A demonstration workspace carries campaign counters instead of dated events. Those counters
    are read only when the workspace says it is a demonstration, which is what keeps sample
    material out of a real account's figures. */

export type Period={from:string;to:string};
export type Selection={campaign:'all'|'active'|'finished'|string};

export const periods:Record<string,number|null>={today:0,yesterday:1,'7d':7,'30d':30,'90d':90,all:null};

/** Resolves a named period into an absolute range, so the interface never computes dates itself
    and the range that produced a number can be shown next to it. */
export function resolvePeriod(name:string,from?:string,to?:string,now=new Date()):Period{
 const end=new Date(now);
 const startOfDay=(d:Date)=>{const c=new Date(d);c.setUTCHours(0,0,0,0);return c;};
 if(name==='custom'&&from&&to)
  return {from:startOfDay(new Date(from)).toISOString(),to:new Date(new Date(to).setUTCHours(23,59,59,999)).toISOString()};
 if(name==='today')return {from:startOfDay(end).toISOString(),to:end.toISOString()};
 if(name==='yesterday'){
  const start=startOfDay(new Date(end.getTime()-86400000));
  return {from:start.toISOString(),to:new Date(start.getTime()+86399999).toISOString()};
 }
 const days=periods[name];
 if(days===null||days===undefined)return {from:new Date(0).toISOString(),to:end.toISOString()};
 return {from:new Date(end.getTime()-days*86400000).toISOString(),to:end.toISOString()};
}

/** The same length of time immediately before the selected one, for the comparison line. */
export function previousPeriod(period:Period):Period{
 const from=new Date(period.from).getTime(),to=new Date(period.to).getTime();
 const span=Math.max(to-from,1);
 return {from:new Date(from-span).toISOString(),to:new Date(from-1).toISOString()};
}

const within=(at:string|null|undefined,p:Period)=>Boolean(at)&&String(at)>=p.from&&String(at)<=p.to;

function selectCampaigns(s:State,selection:Selection){
 if(selection.campaign==='all')return s.campaigns;
 if(selection.campaign==='active')return s.campaigns.filter(c=>c.status==='active');
 if(selection.campaign==='finished')return s.campaigns.filter(c=>c.status!=='active');
 return s.campaigns.filter(c=>c.id===selection.campaign);
}

type Totals={campaigns:number;prepared:number;sent:number;replies:number;positive:number;
 negative:number;meetings:number;suppressed:number;conversion:number};

function totals(s:State,ids:Set<string>,period:Period):Totals{
 const messages=s.messages.filter(m=>ids.has(m.campaignId));
 const prepared=messages.filter(m=>within(m.at,period)).length;
 const replies=s.replies.filter(r=>ids.has(r.campaignId)&&within(r.at,period));
 // A demonstration workspace has counters and no dated sends; a real one has dated sends only.
 const sent=s.demo
  ?s.campaigns.filter(c=>ids.has(c.id)).reduce((n,c)=>n+(c.sent??0),0)
  :messages.filter(m=>within(m.sentAt,period)).length;
 const positive=replies.filter(r=>r.category==='positive').length;
 const meetings=Object.entries(s.threads??{}).filter(([,t])=>t.outcome==='meeting'&&within(t.at,period)).length;
 return {campaigns:ids.size,prepared,sent,replies:replies.length,positive,
  negative:replies.filter(r=>['negative','unsubscribe'].includes(r.category)).length,
  meetings,suppressed:s.suppressed.length,
  conversion:sent?Number((positive/sent*100).toFixed(1)):0};
}

const change=(now:number,before:number)=>before?Number(((now-before)/before*100).toFixed(1)):now?100:0;

/** Replies per day inside the selected range, which is what the chart draws. */
function series(s:State,ids:Set<string>,period:Period){
 const days=new Map<string,{day:string;replies:number;positive:number}>();
 const from=new Date(period.from),to=new Date(period.to);
 const span=Math.min(Math.ceil((to.getTime()-from.getTime())/86400000)+1,120);
 for(let i=0;i<span;i++){
  const day=new Date(to.getTime()-i*86400000).toISOString().slice(0,10);
  days.set(day,{day,replies:0,positive:0});
 }
 for(const r of s.replies){
  if(!ids.has(r.campaignId)||!within(r.at,period))continue;
  const bucket=days.get(String(r.at).slice(0,10));
  if(!bucket)continue;
  bucket.replies++;
  if(r.category==='positive')bucket.positive++;
 }
 return [...days.values()].reverse();
}

export function analytics(s:State,input:{period?:string;from?:string;to?:string;campaign?:string},now=new Date()){
 const selection:Selection={campaign:(input.campaign||'all') as Selection['campaign']};
 const period=resolvePeriod(input.period||'30d',input.from,input.to,now);
 const previous=previousPeriod(period);
 const chosen=selectCampaigns(s,selection);
 const ids=new Set(chosen.map(c=>c.id));
 const current=totals(s,ids,period);
 const before=totals(s,ids,previous);
 const reasons=Object.entries(s.replies.filter(r=>ids.has(r.campaignId)&&within(r.at,period))
  .reduce((acc:Record<string,number>,r)=>{acc[r.category]=(acc[r.category]??0)+1;return acc;},{}))
  .map(([category,count])=>({category,count})).sort((a,b)=>b.count-a.count);
 return {
  period:{...period,name:input.period||'30d'},previous,
  selection:selection.campaign,
  demo:s.demo,
  totals:current,
  comparison:Object.fromEntries(Object.keys(current).map(k=>
   [k,change((current as any)[k],(before as any)[k])])) as Record<keyof Totals,number>,
  campaigns:chosen.map(c=>{
   const one=totals(s,new Set([c.id]),period);
   return {id:c.id,name:c.name,market:c.market,status:c.status,createdAt:c.createdAt,
    prepared:one.prepared,sent:one.sent,replies:one.replies,positive:one.positive,conversion:one.conversion};
  }).sort((a,b)=>b.positive-a.positive),
  reasons,
  series:series(s,ids,period)
 };
}
