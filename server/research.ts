import {z} from 'zod';
import {complete,aiReady} from './ai';
import {search,searchReady,type Hit} from './search';
import {locationBrief,locationLabel,type Location} from './geo';
import type {Research} from './seed';
import type {ResearchConfig} from './recipients';

/** One research mechanism for both screens.

    "Возможности" asks what to sell somewhere; "Рынки" asks where to sell something. They differ
    only in the question put to the model and in which half of the answer the interface leads
    with, so they share this file: one schema, one scoring function, one grounding step and one
    result type. The UI, MCP and the platform model all arrive here, which is why a search run
    from ChatGPT produces exactly the rows the screen shows. */

/** How many cards each screen shows. The grid is built for six. */
export const RESULTS=6;

/** The factors of the brief, scored 0–10 by the model and combined by us.
    The model never returns the score itself: a number it invented could not be explained,
    and two searches would not be comparable. */
const factorSchema=z.object({
 pain:z.number().min(0).max(10),
 urgency:z.number().min(0).max(10),
 willingnessToPay:z.number().min(0).max(10),
 buyerReach:z.number().min(0).max(10),
 aiAdvantage:z.number().min(0).max(10),
 marketSize:z.number().min(0).max(10),
 implementation:z.number().min(0).max(10),
 salesDifficulty:z.number().min(0).max(10),
 competition:z.number().min(0).max(10),
 legalRisk:z.number().min(0).max(10)
});
export type Factors=z.infer<typeof factorSchema>;

export const upside=['pain','urgency','willingnessToPay','buyerReach','aiAdvantage','marketSize'] as const;
export const downside=['implementation','salesDifficulty','competition','legalRisk'] as const;

export const factorLabels:Record<string,string>={
 pain:'Боль',urgency:'Срочность',willingnessToPay:'Готовность платить',buyerReach:'Доступность покупателей',
 aiAdvantage:'Преимущество от ИИ',marketSize:'Размер рынка',implementation:'Сложность реализации',
 salesDifficulty:'Сложность продажи',competition:'Конкуренция',legalRisk:'Правовой риск'};

const geometric=(values:number[])=>Math.pow(values.reduce((a,v)=>a*Math.min(Math.max(v,0.5),10)/10,1),1/values.length);

/** The brief scores an idea as pain × urgency × ability to pay × reach × AI advantage × market,
    divided by implementation × sales × competition × legal risk. Taken literally that ratio is
    unbounded and could not be printed as "оценка 0–100", so the two sides are averaged
    geometrically — which keeps every factor multiplicative, as the brief intends — and the
    difficulty side is applied as a penalty. Every factor still moves the score in the direction
    the brief gives it, and the result always fits the scale the interface shows. */
export function score(f:Factors){
 const up=geometric(upside.map(k=>f[k]));
 const down=geometric(downside.map(k=>f[k]));
 return Math.max(0,Math.min(100,Math.round(100*up*(1-0.75*down))));
}

export const level=(value:number)=>value<=3?'низкая':value<=6?'средняя':'высокая';

/** Why the number came out as it did, composed from the factors rather than asked for, so the
    explanation can never disagree with the score standing next to it. */
export function explain(f:Factors){
 const best=[...upside].sort((a,b)=>f[b]-f[a]).slice(0,2).map(k=>`${factorLabels[k].toLowerCase()} ${f[k]}/10`);
 const worst=[...downside].sort((a,b)=>f[b]-f[a]).slice(0,2).map(k=>`${factorLabels[k].toLowerCase()} ${f[k]}/10`);
 return `Поднимают оценку: ${best.join(', ')}. Снижают: ${worst.join(', ')}.`;
}

const itemSchema=z.object({
 name:z.string().min(3).max(160),
 market:z.string().min(2).max(160),
 niche:z.string().min(2).max(160),
 summary:z.string().min(20).max(600),
 audience:z.string().min(5).max(300),
 whyNow:z.string().min(10).max(500),
 whyHere:z.string().min(10).max(500),
 ticket:z.string().min(1).max(120),
 pain:z.string().min(10).max(400),
 payingPower:z.string().min(5).max(300),
 reach:z.string().min(5).max(300),
 why:z.string().min(10).max(500),
 factors:factorSchema
});
const answerSchema=z.object({items:z.array(itemSchema).min(1).max(12)});

const rules=`Ты аналитик, который ищет реальные возможности для небольшого бизнеса с использованием ИИ.
Жёсткие правила:
— Опирайся на переданные результаты поиска, если они есть, и не выдумывай факты, которых в них нет.
— Ни одна возможность не должна быть общей формулировкой вроде «внедрить ИИ». Называй конкретную работу и конкретного покупателя.
— market — территория (страна, регион или город). niche — отрасль или направление.
— ticket — предполагаемый чек в долларах, например «1500–4000 $ в месяц».
— factors — оценки от 0 до 10. Для pain, urgency, willingnessToPay, buyerReach, aiAdvantage, marketSize больше значит лучше.
  Для implementation, salesDifficulty, competition, legalRisk больше значит хуже и сложнее.
— why — одно предложение о том, почему это стоит внимания.
Отвечай только JSON.`;

/** Grounding: the same web search adapter the recipient research already uses. Without a search
    key the model answers from what it knows and the result says so, rather than pretending. */
async function ground(queries:string[],config:ResearchConfig,signal?:AbortSignal){
 const hits:Hit[]=[];
 const notes:string[]=[];
 if(!searchReady(config)){
  notes.push('Веб-поиск не подключён: результаты основаны только на знаниях модели.');
  return {hits,notes};
 }
 for(const query of queries.slice(0,3)){
  try{for(const h of await search(query,config,6,signal))if(h.url&&!hits.some(x=>x.url===h.url))hits.push(h);}
  catch(e:any){notes.push(`Запрос «${query}»: ${e.message}`);}
 }
 return {hits,notes};
}

const corpusOf=(hits:Hit[])=>hits.length
 ?`\n\nСвежие результаты поиска, на которые следует опираться:\n\n`+hits.map((h,i)=>`[${i+1}] ${h.title}\n${h.url}\n${h.snippet}`).join('\n\n')
 :'';

const sourcesOf=(hits:Hit[])=>hits.slice(0,6).map(h=>({title:h.title,url:h.url}));

/** The model answers, we score. Both screens land here, so a card is shaped the same whichever
    question produced it and a favourite of either kind is one row. */
function toResearch(kind:Research['kind'],raw:z.infer<typeof itemSchema>,hits:Hit[],at:string):Research{
 const factors=raw.factors;
 return {
  // globalThis.crypto is available in Node and in the browser, and the interface imports the
  // scoring and the labels from this module, so nothing here may reach for a Node built-in.
  id:crypto.randomUUID(),kind,
  name:raw.name,market:raw.market,niche:raw.niche,
  summary:raw.summary,audience:raw.audience,whyNow:raw.whyNow,whyHere:raw.whyHere,ticket:raw.ticket,
  pain:raw.pain,payingPower:raw.payingPower,reach:raw.reach,
  factors,
  implementation:factors.implementation,salesDifficulty:factors.salesDifficulty,
  competition:factors.competition,legalRisk:factors.legalRisk,
  score:score(factors),why:raw.why,scoreWhy:explain(factors),
  sources:sourcesOf(hits),researchedAt:at
 };
}

/** The same card, built from research somebody else did.

    A connector driving Sendina from a chat has already done the finding, the reading and the
    reasoning; what it needs is somewhere durable to put the result. It lands in exactly the row
    shape the screens read, through the same scoring function — the score is still computed here
    from the factors and never accepted as a number, so a card that arrived from a chat and a card
    Sendina researched itself remain comparable and neither can claim a rating it did not earn. */
export const importedItemSchema=itemSchema;
export function researchFromInput(kind:Research['kind'],raw:z.infer<typeof itemSchema>,
 sources:{title:string;url:string}[]=[],at=new Date().toISOString()):Research{
 return {...toResearch(kind,raw,[],at),sources:sources.slice(0,6)};
}

export type OpportunityInput={location:Location;industry:string;note:string};
export type MarketInput={mode:'country'|'niche'|'manual';location:Location;niche:string};

const requireModel=(config:ResearchConfig)=>{
 if(!aiReady(config))throw Error('Модель не подключена. Обратитесь к администратору Sendina.');
};

const today=()=>new Date().toISOString().slice(0,10);

/** Opportunity Research: what is worth selling, here, now. */
export async function researchOpportunities(input:OpportunityInput,config:ResearchConfig,signal?:AbortSignal){
 requireModel(config);
 const where=locationLabel(input.location);
 const what=input.industry.trim();
 const queries=[
  `${what||'малый бизнес'} ${where==='Выбирает Sendina'?'':where} проблемы ${new Date().getFullYear()}`,
  `${what||'small business'} ${where==='Выбирает Sendina'?'':where} AI automation demand`,
  `${what||''} ${where==='Выбирает Sendina'?'':where} рынок услуг спрос`
 ].map(q=>q.replace(/\s+/g,' ').trim()).filter(q=>q.length>4);
 const {hits,notes}=await ground(queries,config,signal);
 const answer=await complete({name:'opportunity_research',schema:answerSchema,signal,config,system:rules,
  user:`Сегодня ${today()}. Найди ровно ${RESULTS} актуальных возможностей заработать с помощью ИИ.\n\n`+
   `${locationBrief(input.location)}\n`+
   `${what?`Направление или отрасль: ${what}\n`:'Отрасль не задана: выбери самые перспективные направления сам.\n'}`+
   `${input.note.trim()?`Дополнительное условие: ${input.note.trim()}\n`:''}`+
   `\nДля каждой возможности объясни, почему именно сейчас и почему именно эта локация.`+
   corpusOf(hits)});
 const at=new Date().toISOString();
 const items=answer.items.map(i=>toResearch('opportunity',i,hits,at)).sort((a,b)=>b.score-a.score).slice(0,RESULTS);
 return {items,notes,at,grounded:hits.length>0};
}

/** Market Research: three questions, one mechanism.
    A country asks which niches; a niche asks which countries; both together asks only for a
    verdict on that pairing, which is what "ИИ — помощник, а не обязательный источник решения"
    means in practice. */
export async function researchMarkets(input:MarketInput,config:ResearchConfig,signal?:AbortSignal){
 requireModel(config);
 const where=locationLabel(input.location);
 const niche=input.niche.trim();
 if(input.mode==='country'&&(!input.location||input.location.auto))throw Error('Укажите страну или регион.');
 if(input.mode==='niche'&&!niche)throw Error('Укажите нишу, продукт или направление.');
 if(input.mode==='manual'&&(!niche||input.location.auto))throw Error('Для ручной оценки нужны и локация, и ниша.');
 const wanted=input.mode==='manual'?1:RESULTS;
 const queries=input.mode==='niche'
  ?[`${niche} рынок по странам спрос ${new Date().getFullYear()}`,`${niche} best countries demand growth`,`${niche} B2B рынок конкуренция`]
  :[`${where} перспективные ниши малый бизнес ${new Date().getFullYear()}`,`${where} ${niche} рынок спрос`,`${where} business services demand growth`];
 const {hits,notes}=await ground(queries.map(q=>q.replace(/\s+/g,' ').trim()).filter(q=>q.length>4),config,signal);
 const question=input.mode==='country'
  ?`${locationBrief(input.location)}\n\nНазови ровно ${RESULTS} самых перспективных ниш для этой территории на сегодня. Поле market у всех — эта территория, niche — предлагаемая ниша.`
  :input.mode==='niche'
  ?`Ниша, продукт или направление: ${niche}\n\nНазови ровно ${RESULTS} самых перспективных стран или регионов для неё на сегодня. Поле niche у всех — эта ниша, market — предлагаемая территория.`
  :`${locationBrief(input.location)}\nНиша: ${niche}\n\nОцени именно это сочетание территории и ниши. Верни ровно один элемент: market — эта территория, niche — эта ниша. Не предлагай других вариантов.`;
 const answer=await complete({name:'market_research',schema:answerSchema,signal,config,system:rules,
  user:`Сегодня ${today()}. ${question}${corpusOf(hits)}`});
 const at=new Date().toISOString();
 const items=answer.items.map(i=>toResearch('market',i,hits,at)).sort((a,b)=>b.score-a.score).slice(0,wanted);
 return {items,notes,at,grounded:hits.length>0};
}

/** What a campaign made from a researched card starts with. Both kinds land in the same
    Campaign through the same operation; there is no market campaign and no opportunity campaign. */
export function campaignDraft(item:Research){
 return {
  name:item.name.slice(0,150),
  goal:'Продажа услуги',
  context:[item.summary,`Для кого: ${item.audience}.`,`Проблема: ${item.pain}`,`Почему сейчас: ${item.whyNow}`,
   `Предполагаемый чек: ${item.ticket}.`].join(' ').slice(0,5000),
  event:'Встреча'
 };
}
