import {createServer} from 'node:http';
import {appendFileSync,writeFileSync} from 'node:fs';
import {smtpStub,messageText} from '../smtpstub';

/** Infrastructure the product needs but a browser test must not depend on: the model, the web
    search and platform mail. Each stub answers the way the real service does, so the code under
    test is the real code — the research prompt, the schema validation and the scoring all run. */

const item=(name:string,market:string,niche:string,factors:Record<string,number>)=>({
 name,market,niche,
 summary:`Конкретная работа для покупателя: ${name}. Ниша ${niche}, территория ${market}.`,
 audience:'Владельцы небольших компаний этой ниши',
 whyNow:'Спрос вырос в этом году, а готовых решений на рынке мало',
 whyHere:`В ${market} у этой ниши много независимых компаний без внутренней разработки`,
 ticket:'1500–4000 $ в месяц',
 pain:'Заявки обрабатываются вручную, часть теряется',
 payingPower:'Средний бизнес с регулярной выручкой',
 reach:'Публичные контакты на сайтах компаний',
 why:'Понятная работа, за которую платят уже сегодня',
 factors
});

const strong={pain:9,urgency:8,willingnessToPay:8,buyerReach:8,aiAdvantage:9,marketSize:7,
 implementation:3,salesDifficulty:4,competition:3,legalRisk:2};
const weak={pain:5,urgency:4,willingnessToPay:4,buyerReach:5,aiAdvantage:5,marketSize:4,
 implementation:7,salesDifficulty:7,competition:8,legalRisk:6};

const six=(names:string[],market:(i:number)=>string,niche:(i:number)=>string)=>
 ({items:names.map((n,i)=>item(n,market(i),niche(i),i%2?weak:strong))});

const hits=[
 {title:'Harbour Hotel — contact',link:'https://harbour.example/contact',
  snippet:'Reservations manager Maria Lang, write to bookings@harbour.example about booking integrations.'},
 {title:'Riverside Rooms — team',link:'https://riverside.example/team',
  snippet:'Riverside Rooms is looking for booking automation partners.'}
];
const candidates={candidates:[
 {name:'Maria Lang',company:'Harbour Hotel',role:'Reservations manager',country:'United Kingdom',
  sourceUrl:'https://harbour.example/contact',email:'bookings@harbour.example',
  evidence:'write to bookings@harbour.example about booking integrations',
  reason:'Они просят писать по вопросам интеграции бронирования',
  basis:'Опубликованный рабочий контакт',confidence:82}
]};

/** One HTTP stub for the model and the web search. */
export function infrastructure(port:number){
 const server=createServer((req,res)=>{
  let body='';req.on('data',c=>body+=c);
  req.on('end',()=>{
   res.setHeader('Content-Type','application/json');
   if(req.url==='/search')return res.end(JSON.stringify({organic:hits}));
   const asked=JSON.stringify(JSON.parse(body||'{}'));
   const answer=
    asked.includes('возможностей заработать')
     ?six(['Автоответы для клиник','Возврат брошенных заявок','Отчёты для бухгалтерии',
       'Обзвон и запись клиентов','Разбор входящей почты','Подготовка коммерческих предложений'],
      ()=>asked.includes('Германия')?'Германия':asked.includes('Локация не задана')?'США':'Испания',
      i=>['Клиники','Услуги','Бухгалтерия','Салоны','Логистика','B2B-продажи'][i])
    :asked.includes('самых перспективных ниш')
     ?six(['Клиники','Логистика','Ремонт','Юридические услуги','Образование','Гостиницы'],
      ()=>asked.includes('Германия')?'Германия':'Испания',
      i=>['Клиники','Логистика','Ремонт','Юридические услуги','Образование','Гостиницы'][i])
    :asked.includes('самых перспективных стран')
     ?six(['Германия','США','Испания','Нидерланды','Польша','Канада'],
      i=>['Германия','США','Испания','Нидерланды','Польша','Канада'][i],()=>'Заданная ниша')
    :asked.includes('Верни ровно один элемент')
     ?{items:[item('Оценка сочетания','Германия','Заданная ниша',strong)]}
    :asked.includes('выбираешь страну или регион')
     ?{market:'Великобритания',why:'Продукт описан для небольших отелей, а спрос там выражен яснее всего.'}
    :asked.includes('поисковых запросов')
     ?{profile:'Небольшие отели, автоматизирующие бронирование',queries:['boutique hotels brighton']}
    :candidates;
   res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}));
  });
 });
 return server;
}

/** Platform mail. The browser cannot read a mailbox, so every delivery is appended to a file the
    test reads — the login path itself stays the real one. */
export function mailbox(port:number,file:string){
 writeFileSync(file,'');
 const smtp=smtpStub(port);
 const seen=new Set<number>();
 const watch=setInterval(()=>{
  smtp.inbox.forEach((mail,i)=>{
   if(seen.has(i))return;
   seen.add(i);
   appendFileSync(file,JSON.stringify({to:mail.to,text:messageText(mail.body)})+'\n');
  });
 },50);
 watch.unref();
 return smtp;
}
