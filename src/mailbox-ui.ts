export type MailboxProductState='DISCONNECTED'|'CONNECTING'|'READY'|'DEGRADED'|'REAUTH_REQUIRED'|'ERROR';

export type MailboxUiMeta={label:string;badge:'active'|'draft'|'paused';lead:string;primaryAction:'CONNECT'|'VERIFY'|'RETRY'|'REAUTHENTICATE'|'FIX_CONFIGURATION'|null};

const states:Record<MailboxProductState,MailboxUiMeta>={
 DISCONNECTED:{label:'Не подключён',badge:'draft',lead:'Подключите почтовый ящик.',primaryAction:'CONNECT'},
 CONNECTING:{label:'Подключается',badge:'draft',lead:'Подключение создано, требуется проверка.',primaryAction:'VERIFY'},
 READY:{label:'Готов',badge:'active',lead:'Отправка и приём через почтового провайдера доступны.',primaryAction:null},
 DEGRADED:{label:'Временно недоступен',badge:'paused',lead:'Провайдер временно не готов. Повторите проверку.',primaryAction:'RETRY'},
 REAUTH_REQUIRED:{label:'Нужно войти снова',badge:'paused',lead:'Доступ к почтовому аккаунту отозван или истёк. Подключите его заново.',primaryAction:'REAUTHENTICATE'},
 ERROR:{label:'Требуется исправление',badge:'paused',lead:'Провайдер сообщил постоянную ошибку конфигурации.',primaryAction:'FIX_CONFIGURATION'}
};

export function mailboxUi(mailbox:any):MailboxUiMeta{
 const state=String(mailbox?.state??'') as MailboxProductState;
 if(state in states)return states[state];
 if(mailbox?.connection==='none'||!mailbox?.connection)return states.DISCONNECTED;
 return mailbox?.ready?states.READY:states.CONNECTING;
}

export const isHttpsApiMailbox=(mailbox:any)=>mailbox?.connection==='oauth'&&['google','microsoft'].includes(String(mailbox?.provider));

export function mailboxTransportLabel(mailbox:any){
 if(isHttpsApiMailbox(mailbox))return 'HTTPS API · SMTP/IMAP не требуются';
 if(mailbox?.connection==='smtp')return 'Custom SMTP/IMAP';
 return '';
}
