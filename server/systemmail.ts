import nodemailer from 'nodemailer';
/** Platform mail: login links and approval notices. Never used for campaigns. */
export const systemMailReady=()=>Boolean(process.env.SYSTEM_SMTP_HOST&&process.env.SYSTEM_SMTP_USER&&process.env.SYSTEM_SMTP_PASS);
export const systemFrom=()=>process.env.SYSTEM_MAIL_FROM??process.env.SYSTEM_SMTP_USER??'';

/** Exactly which variables platform mail needs, named the way they are set. Without this the
    only way to learn that login mail is unconfigured was to read the server log, which is not a
    thing an operator can be asked to do to find out why nobody can sign in. */
export const REQUIRED=['SYSTEM_SMTP_HOST','SYSTEM_SMTP_USER','SYSTEM_SMTP_PASS'] as const;
export const OPTIONAL=['SYSTEM_SMTP_PORT','SYSTEM_MAIL_FROM'] as const;

/** Superadmin-only: nothing here reveals a credential, only whether one is present. */
export function systemMailStatus(){
 const missing=REQUIRED.filter(name=>!process.env[name]?.trim());
 return {
  configured:missing.length===0,
  required:[...REQUIRED],optional:[...OPTIONAL],missing,
  host:process.env.SYSTEM_SMTP_HOST??'',
  port:Number(process.env.SYSTEM_SMTP_PORT??587),
  from:systemFrom(),
  blocker:missing.length?{code:'SYSTEM_MAIL_NOT_CONFIGURED',
   message:`Системная почта не настроена: ${missing.join(', ')}. Пока их нет, ссылка для входа обычному пользователю не отправляется, а суперадмину пишется в журнал сервера.`}:null
 };
}

const transport=()=>{
 const port=Number(process.env.SYSTEM_SMTP_PORT??587);
 return nodemailer.createTransport({host:process.env.SYSTEM_SMTP_HOST,port,secure:port===465,
  auth:{user:process.env.SYSTEM_SMTP_USER,pass:process.env.SYSTEM_SMTP_PASS},
  connectionTimeout:20000,greetingTimeout:20000,socketTimeout:20000});
};

export async function sendSystemMail(to:string,subject:string,text:string){
 if(!systemMailReady())throw Error(`Системная почта не настроена: задайте ${REQUIRED.join(', ')}.`);
 await transport().sendMail({from:systemFrom(),to,subject,text});
}

/** Proves the platform mailbox actually sends, which is the step between setting the variables
    and believing that login mail works. It reports rather than throws, so the screen always
    receives an answer it can show. */
export async function testSystemMail(to:string){
 const status=systemMailStatus();
 if(!status.configured)return {ok:false,code:status.blocker!.code,detail:status.blocker!.message,to};
 try{
  await transport().sendMail({from:systemFrom(),to,subject:'Sendina — проверка системной почты',
   text:`Это проверочное письмо системной почты Sendina.

Если вы его получили, ссылки для входа будут доходить: отправлено с ${systemFrom()} через ${process.env.SYSTEM_SMTP_HOST}.`});
  return {ok:true,code:'OK',detail:`Отправлено на ${to} через ${process.env.SYSTEM_SMTP_HOST}.`,to};
 }catch(e:any){return {ok:false,code:'SEND_FAILED',detail:String(e?.message??e).slice(0,300),to};}
}

const strings={
 login:(link:string,minutes:number)=>({subject:'Вход в Sendina',
  text:`Ссылка для входа в Sendina:\n\n${link}\n\nСсылка действует ${minutes} минут и срабатывает один раз.\nЕсли вы не запрашивали вход, просто удалите это письмо.`}),
 pending:()=>({subject:'Заявка в Sendina принята',
  text:'Заявка на доступ к Sendina принята.\n\nДоступ откроется после подтверждения администратором. Мы пришлём письмо со ссылкой для входа, как только это произойдёт.'}),
 approved:(link:string)=>({subject:'Доступ к Sendina открыт',
  text:`Доступ к Sendina подтверждён.\n\nВойти: ${link}`}),
 review:(email:string,link:string)=>({subject:`Sendina: новая заявка — ${email}`,
  text:`Новая заявка на доступ к Sendina: ${email}\n\nПодтвердить или отклонить можно на экране «Аккаунты»: ${link}`})
};

export const mailTemplates=strings;
