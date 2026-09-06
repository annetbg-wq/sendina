import {randomUUID} from 'node:crypto';
import {read} from './store';
import {findAccount,type Account} from './accounts';
import {getAuth,setAuth} from './authstore';
import {threads} from './threads';
import {analytics} from './analytics';
import {domainReadiness,mailboxReadiness} from './readiness';

/** "Просмотреть как пользователя".

    A superadmin can see what an account sees, and cannot touch it. That is enforced by shape
    rather than by a flag: this module only reads, it is reached by a single GET route, and it
    never issues a session for the account being looked at — so there is no path by which a
    mutating operation could run as somebody else. If a privileged change is ever wanted it has
    to be added as its own action, with its own confirmation, writing its own entry here.

    Every look is recorded: who looked, at whom, and when. */

export type SupportEntry={id:string;at:string;actor:string;actorId:string;
 subject:string;subjectId:string;action:string};

const key='support-log';

export async function supportLog(){
 return ((await getAuth<SupportEntry[]>(key))??[]).slice(0,500);
}

async function record(entry:Omit<SupportEntry,'id'|'at'>){
 const log=(await getAuth<SupportEntry[]>(key))??[];
 log.unshift({...entry,id:randomUUID(),at:new Date().toISOString()});
 await setAuth(key,log.slice(0,1000));
}

/** A read-only projection of one account's workspace: campaigns, recipients, replies,
    analytics, mailbox readiness and the workspace's own activity log. */
export async function supportView(actor:Account,accountId:string){
 const subject=await findAccount(accountId);
 if(!subject)throw Error('Аккаунт не найден');
 const s=await read(subject.id);
 await record({actor:actor.email,actorId:actor.id,subject:subject.email,subjectId:subject.id,
  action:'Просмотр рабочей области в режиме поддержки'});
 return {
  readOnly:true,
  account:{id:subject.id,email:subject.email,role:subject.role,status:subject.status,
   createdAt:subject.createdAt,lastLoginAt:subject.lastLoginAt},
  demo:s.demo,stopped:s.stopped,
  campaigns:s.campaigns.map(c=>({id:c.id,name:c.name,market:c.market,goal:c.goal,event:c.event,
   status:c.status,control:c.control,createdAt:c.createdAt,
   contacts:s.contacts.filter(p=>p.campaignId===c.id).length,
   messages:s.messages.filter(m=>m.campaignId===c.id).length,
   replies:s.replies.filter(r=>r.campaignId===c.id).length})),
  recipients:s.contacts.map(p=>({id:p.id,campaignId:p.campaignId,email:p.email,name:p.name,
   company:p.company,role:p.role,country:p.country,verification:p.verification,origin:p.origin})),
  threads:threads(s),
  analytics:analytics(s,{period:'90d',campaign:'all'}),
  domains:s.domains.map(d=>({id:d.id,name:d.name,limit:d.limit,used:d.used,dns:d.dns,
   readiness:domainReadiness(d,s.stopped),
   mailboxes:d.mailboxes.map((m:any)=>({email:m.email,provider:m.provider,connection:m.connection,
    auth:m.auth,testSend:m.testSend,imap:m.imap,incoming:m.incoming,
    readiness:mailboxReadiness(d,m,s.stopped)}))})),
  suppressed:s.suppressed,
  audit:s.audit.slice(0,200),
  favourites:s.favourites.length,
  research:{opportunities:s.research.opportunities?.items.length??0,
   markets:s.research.markets?.items.length??0}
 };
}
