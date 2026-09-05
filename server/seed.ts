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

export const seed = () => ({
  demo:true, stopped:false,
  settings:{recipientMode:'auto' as 'auto'|'search'|'proposal'},
  campaigns:[
    {id:'c1',name:'Продажи бутик-гостиниц в Европе',market:'США',goal:'Продажа услуги',context:'Автоматизация работы небольшого отеля',event:'Встреча',status:'active',sent:392,positive:24,value:2400},
    {id:'c2',name:'Поиск партнёров для внедрения',market:'Великобритания',goal:'Партнёрство',context:'Совместное внедрение решений',event:'Положительный ответ',status:'active',sent:325,positive:13,value:1300},
    {id:'c3',name:'Решение официального запроса',market:'ОАЭ',goal:'Обращение',context:'Получение документов',event:'Получение документа',status:'paused',sent:218,positive:7,value:0}
  ],
  domains:[
    {id:'d1',name:'hotelflow.example',limit:180,used:112,dns:noDns(),mailboxes:[box('outreach@hotelflow.example'),box('partners@hotelflow.example')]},
    {id:'d2',name:'stayali.example',limit:120,used:48,dns:noDns(),mailboxes:[box('sales@stayali.example'),box('contact@stayali.example')]}
  ],
  opportunities:[
    {id:'o1',name:'Отели и гостиницы',market:'США',score:92,trend:8,price:2500,pain:'Ручная обработка запросов гостей',offer:'Автоматизация ответов и бронирований',confidence:78},
    {id:'o2',name:'Помощник по доходу для гостиниц',market:'Германия',score:86,trend:5,price:1800,pain:'Потери выручки при изменении спроса',offer:'Рекомендации по управлению тарифами',confidence:71},
    {id:'o3',name:'Платформа для аренды на сутки',market:'Испания',score:78,trend:0,price:1200,pain:'Разрозненные каналы бронирования',offer:'Единый кабинет объектов и гостей',confidence:66},
    {id:'o4',name:'Сервис для гостей и бронирований',market:'Австралия',score:71,trend:-3,price:1600,pain:'Долгое ожидание ответа',offer:'Многоязычный помощник для гостей',confidence:62},
    {id:'o5',name:'Автоматизация заявок для агентств',market:'Великобритания',score:69,trend:2,price:2100,pain:'Потеря входящих заявок',offer:'Квалификация и маршрутизация обращений',confidence:59}
  ],
  contacts:[] as any[], messages:[] as any[], suppressed:[] as string[],
  replies:[{id:'r1',campaignId:'c1',email:'anna@hotel.example',name:'Анна Мартин',company:'The Garden Hotel',text:'Добрый день! Интересное предложение. Можем обсудить на встрече на следующей неделе?',category:'positive',at:'2026-09-05T09:30:00Z'},{id:'r2',campaignId:'c2',email:'mark@agency.example',name:'Марк Уилсон',company:'North Partners',text:'Спасибо. Пришлите, пожалуйста, подробности о партнёрской программе.',category:'neutral',at:'2026-09-05T08:15:00Z'}],
  audit:[{id:'a1',at:new Date().toISOString(),action:'Создана демонстрационная рабочая область. Показатели и гипотезы — примеры.'}]
});
/** Older stored workspaces kept mailboxes as plain strings and no DNS block. */
export function normalize(s:any){
  s.settings??={recipientMode:'auto'};
  for(const d of s.domains??[]){
    d.dns??=noDns();
    d.mailboxes=(d.mailboxes??[]).map((m:any)=>{
      const merged=typeof m==='string'?box(m):{...box(m.email),...m};
      for(const field of ['auth','testSend','imap','incoming'])
        if(!merged[field]||typeof merged[field]!=='object')merged[field]={status:'none',at:null,detail:''};
      return merged;
    });
    delete d.verified;
  }
  return s;
}
export type State = ReturnType<typeof seed>;
