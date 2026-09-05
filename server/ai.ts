import {z} from 'zod';
/** Provider-independent model router. Every answer is parsed against a schema before use. */
const base=()=>(process.env.AI_GATEWAY_URL??'https://api.openai.com/v1').replace(/\/$/,'');
const key=()=>process.env.OPENAI_API_KEY??'';
export const aiModel=()=>process.env.OPENAI_MODEL??'gpt-4.1-mini';
export const aiReady=()=>Boolean(key());

export class AiUnavailable extends Error{constructor(){super('Модель не подключена. Задайте OPENAI_API_KEY в переменных сервера.');}}

/** Asks for JSON, then validates it. An answer that fails the schema is retried once, then refused. */
export async function complete<T extends z.ZodType>(opts:{system:string;user:string;schema:T;name:string;signal?:AbortSignal}):Promise<z.infer<T>>{
 if(!aiReady())throw new AiUnavailable();
 let jsonSchema:unknown;
 try{jsonSchema=z.toJSONSchema(opts.schema,{io:'output'});}catch{jsonSchema=undefined;}
 const messages=[{role:'system',content:opts.system},{role:'user',content:opts.user}];
 let lastError='';
 for(let attempt=0;attempt<2;attempt++){
  const body={model:aiModel(),messages:attempt===0?messages:[...messages,{role:'user',content:`Предыдущий ответ не прошёл проверку схемы: ${lastError}. Верни только корректный JSON.`}],
   response_format:jsonSchema?{type:'json_schema',json_schema:{name:opts.name,schema:jsonSchema}}:{type:'json_object'}};
  const r=await fetch(`${base()}/chat/completions`,{method:'POST',signal:opts.signal,
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${key()}`},body:JSON.stringify(body)});
  if(!r.ok){const text=await r.text();throw Error(`Модель вернула ошибку ${r.status}: ${text.slice(0,300)}`);}
  const data=await r.json();
  const content=data?.choices?.[0]?.message?.content;
  if(typeof content!=='string'){lastError='пустой ответ';continue;}
  let parsed:unknown;
  try{parsed=JSON.parse(content);}catch{lastError='ответ не является JSON';continue;}
  const result=opts.schema.safeParse(parsed);
  if(result.success)return result.data;
  lastError=result.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ').slice(0,300);
 }
 throw Error(`Ответ модели не прошёл проверку схемы: ${lastError}`);
}
