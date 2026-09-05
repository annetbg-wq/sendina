import nodemailer from 'nodemailer';
/** Platform mail: login links and approval notices. Never used for campaigns. */
export const systemMailReady=()=>Boolean(process.env.SYSTEM_SMTP_HOST&&process.env.SYSTEM_SMTP_USER&&process.env.SYSTEM_SMTP_PASS);
export const systemFrom=()=>process.env.SYSTEM_MAIL_FROM??process.env.SYSTEM_SMTP_USER??'';

export async function sendSystemMail(to:string,subject:string,text:string){
 if(!systemMailReady())throw Error('Системная почта не настроена: задайте SYSTEM_SMTP_HOST, SYSTEM_SMTP_USER и SYSTEM_SMTP_PASS.');
 const port=Number(process.env.SYSTEM_SMTP_PORT??587);
 const transport=nodemailer.createTransport({host:process.env.SYSTEM_SMTP_HOST,port,secure:port===465,
  auth:{user:process.env.SYSTEM_SMTP_USER,pass:process.env.SYSTEM_SMTP_PASS}});
 await transport.sendMail({from:systemFrom(),to,subject,text});
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
