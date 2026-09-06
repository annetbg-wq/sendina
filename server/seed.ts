export const noDns=()=>({spf:false,dkim:false,dmarc:false,checkedAt:null as string|null});
/** A mailbox starts unconnected. Only a successful test send can change that. */
const check=()=>({status:'none' as string,at:null as string|null,detail:''});
export const box=(email:string)=>({email,provider:'unknown' as string,workspace:true,personal:false,
  connection:'none' as string,connectedAt:null as string|null,
  /** The four proofs a mailbox must give, in the order they are attempted. */
  auth:check(),testSend:check(),imap:check(),incoming:check(),
  /** Non-secret shape of the connection, so the interface can show what was detected. */
  transport:null as null|{smtp:{host:string;port:number;secure:boolean};imap:{host:string;port:number;secure:boolean};source:string;label:string},
  incomingUid:0});

/** Where a campaign looks. One country, several, a region, a city, or nothing at all when the
    operator leaves the choice to Sendina. `market` stays the readable label the rest of the
    system already prints; this block is what the interface edits. */
export type Location={countries:string[];region:string;city:string;auto:boolean};
export const anywhere=():Location=>({countries:[],region:'',city:'',auto:true});

/** One researched opportunity or market. Both come from the same research mechanism and are
    scored by the same function, so a favourite of either kind is one row in one list. */
export type Research={
 id:string;kind:'opportunity'|'market';
 name:string;market:string;niche:string;
 summary:string;audience:string;whyNow:string;whyHere:string;ticket:string;
 pain:string;payingPower:string;reach:string;
 factors:Record<string,number>;
 implementation:number;salesDifficulty:number;competition:number;legalRisk:number;
 score:number;why:string;scoreWhy:string;
 sources:{title:string;url:string}[];
 researchedAt:string;
};

/** A real workspace starts empty. Nothing is invented on anyone's behalf: no campaigns, no
    replies, no opportunities and no metrics. Demo material lives in `demoSeed` and only ever
    reaches a workspace that asked to be a demonstration. */
export const seed=()=>({
  demo:false, stopped:false,
  settings:{recipientMode:'auto' as 'auto'|'organisations'|'search'|'proposal'},
  campaigns:[] as any[],
  domains:[] as any[],
  contacts:[] as any[], messages:[] as any[], suppressed:[] as string[],
  replies:[] as any[],
  /** The current result of each research screen. A new search replaces it; nothing accumulates. */
  research:{opportunities:null as null|{at:string;input:any;items:Research[]},
            markets:null as null|{at:string;input:any;items:Research[]}},
  /** Deliberately kept opportunities and markets, of either kind. */
  favourites:[] as Research[],
  /** Per recipient: whether the recommended next action is done, and how the thread ended. */
  threads:{} as Record<string,{done:boolean;outcome:string;at:string}>,
  audit:[] as {id:string;at:string;action:string}[]
});
export type State=ReturnType<typeof seed>;

const letter=(name:string,reason:string,context:string,event:string)=>
 ['Здравствуйте, '+name+'!','',reason,'',context,'','Готовы обсудить следующий шаг: '+event+'?'].join('\n');

/** The demonstration workspace. It exists so the product can be shown without an account,
    and it is never what a new real account receives. */
export function demoSeed():State{
 const at=new Date().toISOString();
 const s=seed();
 s.demo=true;
 s.campaigns=[
  {id:'c1',name:'Продажи бутик-гостиниц в Европе',market:'США',location:{countries:['США'],region:'',city:'',auto:false},goal:'Продажа услуги',context:'Автоматизация работы небольшого отеля',event:'Встреча',status:'active',sent:392,positive:24,value:2400,control:'confirm',firstBatchApprovedAt:null,createdAt:at},
  {id:'c2',name:'Поиск партнёров для внедрения',market:'Великобритания',location:{countries:['Великобритания'],region:'',city:'',auto:false},goal:'Партнёрство',context:'Совместное внедрение решений',event:'Положительный ответ',status:'active',sent:325,positive:13,value:1300,control:'confirm',firstBatchApprovedAt:null,createdAt:at},
  {id:'c3',name:'Решение официального запроса',market:'ОАЭ',location:{countries:['ОАЭ'],region:'',city:'',auto:false},goal:'Обращение',context:'Получение документов',event:'Получение документа',status:'paused',sent:218,positive:7,value:0,control:'confirm',firstBatchApprovedAt:null,createdAt:at}
 ];
 s.domains=[
  {id:'d1',name:'hotelflow.example',limit:180,used:112,dns:noDns(),mailboxes:[box('outreach@hotelflow.example'),box('partners@hotelflow.example')]},
  {id:'d2',name:'stayali.example',limit:120,used:48,dns:noDns(),mailboxes:[box('sales@stayali.example'),box('contact@stayali.example')]}
 ];
 s.contacts=[
  {id:'p1',campaignId:'c1',email:'anna@hotel.example',name:'Анна Мартин',company:'The Garden Hotel',role:'Управляющая',country:'США',source:'https://hotel.example/contact',basis:'Опубликованный рабочий контакт',reason:'Отель ищет способ ускорить ответы гостям',evidence:'Страница контактов отеля',confidence:80,verification:'verified',origin:'search'},
  {id:'p2',campaignId:'c2',email:'mark@agency.example',name:'Марк Уилсон',company:'North Partners',role:'Директор по развитию',country:'Великобритания',source:'https://agency.example/partners',basis:'Опубликованный рабочий контакт',reason:'Агентство ищет партнёров по внедрению',evidence:'Страница партнёрской программы',confidence:70,verification:'verified',origin:'search'}
 ];
 s.messages=[
  {id:'m1',campaignId:'c1',contactId:'p1',email:'anna@hotel.example',subject:'Продажи бутик-гостиниц в Европе',text:letter('Анна','Отель ищет способ ускорить ответы гостям.','Автоматизация работы небольшого отеля','встреча'),status:'sent',bulk:false,at:'2026-09-04T09:00:00Z',sentAt:'2026-09-04T09:00:00Z'},
  {id:'m2',campaignId:'c2',contactId:'p2',email:'mark@agency.example',subject:'Поиск партнёров для внедрения',text:letter('Марк','Агентство ищет партнёров по внедрению.','Совместное внедрение решений','положительный ответ'),status:'sent',bulk:false,at:'2026-09-04T10:00:00Z',sentAt:'2026-09-04T10:00:00Z'}
 ];
 s.replies=[
  {id:'r1',campaignId:'c1',email:'anna@hotel.example',name:'Анна Мартин',company:'The Garden Hotel',text:'Добрый день! Интересное предложение. Можем обсудить на встрече на следующей неделе?',category:'positive',at:'2026-09-05T09:30:00Z'},
  {id:'r2',campaignId:'c2',email:'mark@agency.example',name:'Марк Уилсон',company:'North Partners',text:'Спасибо. Пришлите, пожалуйста, подробности о партнёрской программе.',category:'neutral',at:'2026-09-05T08:15:00Z'}
 ];
 s.audit=[{id:'a1',at,action:'Создана демонстрационная рабочая область. Показатели и гипотезы — примеры.'}];
 return s;
}

/** Older stored workspaces kept mailboxes as plain strings, had no DNS block, and carried
    demonstration opportunities in a field that no longer exists. */
export function normalize(s:any):State{
  s.settings??={recipientMode:'auto'};
  s.demo=Boolean(s.demo);
  s.research??={opportunities:null,markets:null};
  s.research.opportunities??=null;
  s.research.markets??=null;
  s.favourites??=[];
  s.threads??={};
  s.contacts??=[];s.messages??=[];s.replies??=[];s.suppressed??=[];s.audit??=[];s.campaigns??=[];s.domains??=[];
  // The demonstration hypotheses used to be seeded into every workspace. They are not data.
  delete s.opportunities;
  for(const c of s.campaigns){
    c.control??='confirm';
    c.firstBatchApprovedAt??=null;
    c.createdAt??=s.audit[s.audit.length-1]?.at??new Date().toISOString();
    c.location??=c.market?{countries:[c.market],region:'',city:'',auto:false}:anywhere();
  }
  for(const m of s.messages)m.at??=null;
  for(const d of s.domains){
    d.dns??=noDns();
    d.mailboxes=(d.mailboxes??[]).map((m:any)=>{
      const merged=typeof m==='string'?box(m):{...box(m.email),...m};
      for(const field of ['auth','testSend','imap','incoming'])
        if(!merged[field]||typeof merged[field]!=='object')merged[field]={status:'none',at:null,detail:''};
      return merged;
    });
    delete d.verified;
  }
  return s as State;
}
