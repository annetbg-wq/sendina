import {dictionary} from './i18n';

/** Mailbox-state copy arrived after the original interface dictionary. Keep the migration copy
 * next to the model it describes so RU/EN cannot silently diverge while the legacy strings are
 * retired. Exact phrases are registered before React renders; the generic i18n walker then treats
 * them exactly like the rest of the interface. */
Object.assign(dictionary,{
 'Отправитель не готов':'Sender not ready',
 'Google и Microsoft работают через HTTPS API':'Google and Microsoft work through HTTPS APIs',
 'Подключите рабочий адрес через Google или Microsoft. SMTP/IMAP для них не требуются; ручной SMTP/IMAP остаётся отдельным расширенным режимом для других провайдеров.':'Connect a work address through Google or Microsoft. They do not require SMTP/IMAP; manual SMTP/IMAP remains a separate advanced mode for other providers.',
 'Не подключён':'Disconnected',
 'Подключите почтовый ящик.':'Connect a mailbox.',
 'Подключается':'Connecting',
 'Подключение создано, требуется проверка.':'The connection exists and needs verification.',
 'Отправка и приём через почтового провайдера доступны.':'Sending and receiving through the mail provider are available.',
 'Временно недоступен':'Temporarily unavailable',
 'Провайдер временно не готов. Повторите проверку.':'The provider is temporarily unavailable. Run the check again.',
 'Нужно войти снова':'Sign in again',
 'Доступ к почтовому аккаунту отозван или истёк. Подключите его заново.':'Access to the mail account was revoked or expired. Reconnect it.',
 'Требуется исправление':'Needs attention',
 'Провайдер сообщил постоянную ошибку конфигурации.':'The provider reported a persistent configuration error.',
 'HTTPS API · SMTP/IMAP не требуются':'HTTPS API · SMTP/IMAP not required',
 'Техническая диагностика':'Technical diagnostics',
 'Все проверки пройдены':'All checks passed',
 'Требует внимания:':'Needs attention:',
 'Технический код:':'Technical code:',
 'Основной статус ящика показан ниже и рассчитывается сервером.':'The primary mailbox state is shown below and is calculated by the server.',
 'Скрыть диагностику':'Hide diagnostics',
 'Ни один ящик пока не находится в состоянии «Готов», поэтому отправка заблокирована.':'No mailbox is currently Ready, so sending is blocked.',
 'Канал приёма':'Incoming channel',
 'Чтение теста':'Reading the test message',
 'Войти снова':'Sign in again',
 'Проверить состояние':'Check status',
 'Перепроверить':'Check again',
 'Нужно заново подключить почтовый аккаунт':'Reconnect the mail account',
 'Провайдер временно ограничил запросы':'The provider temporarily rate-limited requests',
 'Провайдер временно недоступен':'The provider is temporarily unavailable',
 'Ошибка конфигурации почтового провайдера':'Mail provider configuration error',
 'Не удалось подтвердить состояние почтового провайдера':'Could not confirm mail provider state',
 'Результат отправки уточняется':'Delivery result is being reconciled',
 'Результат предыдущей отправки неизвестен':'The previous delivery result is unknown',
 'Уточняется':'Reconciling',
 'Подключение через API этого провайдера временно недоступно: OAuth-приложение Sendina ещё не настроено.':'API connection for this provider is temporarily unavailable because the Sendina OAuth application is not configured yet.',
 'Подключение выполняется через официальный API провайдера по HTTPS. Пароль, SMTP и IMAP не нужны.':'The connection uses the provider official API over HTTPS. No password, SMTP or IMAP is required.',
 'Приложение Sendina — никаких Client ID или Client Secret вводить не нужно.':'Sendina uses its platform application; you do not enter any Client ID or Client Secret.',
 'Настройте OAuth-приложение платформы на экране «Аккаунты».':'Configure the platform OAuth application on the Accounts screen.',
 'Обратитесь к администратору Sendina.':'Contact your Sendina administrator.',
 'Отдельный custom-режим':'Separate custom mode',
 'Этот путь использует SMTP/IMAP и может не работать на хостинге с закрытыми почтовыми портами. Для Google/Microsoft стандартный путь выше — OAuth через HTTPS API.':'This path uses SMTP/IMAP and may not work on hosting that blocks mail ports. For Google/Microsoft, the standard path above is OAuth over HTTPS APIs.',
 'Расширенная настройка custom SMTP/IMAP. Эти параметры есть в панели вашего почтового провайдера.':'Advanced custom SMTP/IMAP setup. These values are available in your mail provider control panel.',
 'Пароль шифруется на сервере и никогда не возвращается в интерфейс. Этот режим существует только для совместимости с custom SMTP/IMAP.':'The password is encrypted on the server and never returned to the interface. This mode exists only for custom SMTP/IMAP compatibility.',
 'Подключить custom SMTP/IMAP':'Connect custom SMTP/IMAP'
});

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
