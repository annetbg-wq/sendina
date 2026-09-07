import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {ChartNoAxesCombined,House,Send,Lightbulb,Globe,Mail,MessageCircle,ChartNoAxesColumnIncreasing,Settings,Search,Bell,ChevronDown,ArrowRight,ChevronRight,ShieldCheck,Target,Trophy,Star,Check,Plus,Pause,Play,X,Users,CalendarDays,Handshake,ArrowUpRight,ArrowDownRight,Shield,Power,ExternalLink,Info,RefreshCw,Menu,Ban,Plug,Server,Eye} from 'lucide-react';
import type {State} from '../server/seed';
import './styles.css';
import {localize, translate, LocaleContext, type Locale} from './i18n';
import {api,backendUrl,browserDemo,captureSession,session,setSession} from './api';
import {Flag} from './flag';
import {LocationPicker,emptyLocation} from './location';
import {Opportunities} from './opportunities';
import {Markets} from './markets';
import {Replies} from './replies';
import {Analytics} from './analytics';
import {Accounts} from './accounts';
import {mailboxReadiness,domainReadiness} from '../server/readiness';
import type {Location} from '../server/geo';

/** The menu is built from the role rather than filtered afterwards: an ordinary account never
    receives an "Аккаунты" item at all, and the routes behind it refuse them anyway.
    "Домены и почта" left this list and lives inside Settings, where connecting a mailbox
    belongs — the screen itself is unchanged. */
const navigation=[['Главная',House],['Рассылки',Send],['Возможности',Lightbulb],['Рынки',Globe],
 ['Ответы',MessageCircle],['Аналитика',ChartNoAxesColumnIncreasing],['Настройки',Settings]] as const;

const providers:Record<string,string>={google:'Google Workspace',microsoft:'Microsoft 365',smtp:'SMTP',unknown:'Провайдер не определён'};
const connections:Record<string,string>={none:'не подключён',oauth:'подключён по OAuth',smtp:'подключён по SMTP'};
const blockers:Record<string,string>={EMERGENCY_STOP:'Аварийная остановка',NO_MAILBOX:'Нет ящиков',NOT_CONNECTED:'Ящик не подключён',
 AUTH_REQUIRED:'Нужна проверка входа',AUTH_FAILED:'Вход не принят',
 TEST_SEND_REQUIRED:'Нужна тестовая отправка',TEST_SEND_FAILED:'Тестовая отправка не прошла',
 INCOMING_CHANNEL_REQUIRED:'Нужна проверка приёма',INCOMING_CHANNEL_FAILED:'Приём почты недоступен',
 INCOMING_MESSAGE_REQUIRED:'Тестовое письмо ещё не прочитано',INCOMING_MESSAGE_FAILED:'Тестовое письмо не пришло',
 DNS_NOT_CHECKED:'DNS не проверялся',SPF_MISSING:'Нет записи SPF',DKIM_MISSING:'Нет записи DKIM',DMARC_MISSING:'Нет записи DMARC',
 SENDING_DISABLED_ON_DEPLOYMENT:'Отправка выключена на развёртывании',SENDER_NOT_READY:'Нет проверенного ящика',
 DOMAIN_LIMIT_NOT_SET:'Не задан суточный лимит домена',DOMAIN_LIMIT:'Суточный лимит домена исчерпан'};
const checkLabels:[string,string][]=[['auth','Вход'],['testSend','Отправка'],['imap','Приём'],['incoming','Чтение письма']];
const reasons:Record<string,string>={CHECKS_PASSED:'Разрешено правилами',EMERGENCY_STOP:'Аварийная остановка',CAMPAIGN_PAUSED:'Кампания не активна',GLOBAL_SUPPRESSION:'Адресат исключён',REPLY_RECEIVED:'Ответ уже получен',DUPLICATE_RECIPIENT:'Повтор адреса в другой кампании',LEGAL_BASIS_REQUIRED:'Нет правового основания',CONTACT_REASON_REQUIRED:'Нет причины обращения',SOURCE_UNVERIFIED:'Источник не подтверждён',MANUAL_APPROVAL_REQUIRED:'Отправка только вручную',FIRST_BATCH_APPROVAL_REQUIRED:'Нужно подтверждение первой партии',DOMAIN_UNVERIFIED:'Домен не подтверждён',DOMAIN_LIMIT:'Достигнут суточный лимит домена',
 SENT:'Отправлено',SEND_FAILED:'Ошибка отправки',RECIPIENT_NOT_ALLOWLISTED:'Адрес не в списке разрешённых',
 SENDER_NOT_READY:'Нет проверенного ящика',ALREADY_SENT:'Письмо уже отправлено',NO_ADDRESS:'Нет подтверждённого адреса',
 MESSAGE_MISSING:'Черновик не найден',CAMPAIGN_MISSING:'Кампания не найдена',RECIPIENT_MISSING:'Адресат не найден'};

/** Which part of Settings is open. "Домены и почта" is the first of them. */
const settingsSections=[
 ['mail','Почта и домены',Mail],
 ['integrations','Интеграции',Plug],
 ['exclusions','Запрещённые адресаты',Ban],
 ['workspace','Рабочая область',Settings],
 ['server','Сервер приложения',Server]
] as const;

function App(){
 const [locale,setLocale]=useState<Locale>(()=>localStorage.getItem('sendina-locale')==='en'?'en':'ru');
 const [integration,setIntegration]=useState<any>(null);
 const [serverDraft,setServerDraft]=useState(backendUrl());
 const [account,setAccount]=useState<any>(null);
 const [loginState,setLoginState]=useState<{status:string;message:string}|null>(null);
 const [arrival]=useState(()=>captureSession());
 const [research,setResearch]=useState<any>(null);
 const [caps,setCaps]=useState<any>(null);
 const [detection,setDetection]=useState<any>(null);
 const [connector,setConnector]=useState('');
 const [advanced,setAdvanced]=useState(false);
 /** Whether the password route has been asked for where consent is the intended one. */
 const [expert,setExpert]=useState(false);
 /** The last finished mailbox check, kept so its four steps stay readable after the modal closes. */
 const [check,setCheck]=useState<any>(null);
 /** Sending readiness, and the result of the last run. Read from the server, never inferred. */
 const [sender,setSender]=useState<any>(null);
 const [sendRun,setSendRun]=useState<any>(null);
 const [guided,setGuided]=useState<any>(null);
 const [section,setSection]=useState<string>('mail');
 const [draftLocation,setDraftLocation]=useState<Location>(emptyLocation());
 useEffect(()=>{localStorage.setItem('sendina-locale',locale);document.documentElement.lang=locale;document.title=locale==='ru'?'Sendina — Монетизатор':'Sendina — Monetizer';},[locale]);
 const [state,setState]=useState<State|null>(null),[page,setPage]=useState('Главная'),[query,setQuery]=useState(''),[modal,setModal]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[preview,setPreview]=useState<any[]>([]),[menu,setMenu]=useState(false);
 const reload=async()=>{setState(await api('/state'));
  api('/capabilities').then(c=>{setCaps(c);setAccount(c.account??null);}).catch(()=>setCaps(null));
  api('/sender').then(setSender).catch(()=>setSender(null));};
 useEffect(()=>{let active=true;const load=async()=>{for(let attempt=0;attempt<4;attempt++){try{await reload();return;}catch(e:any){if(e.status===401)return;if(attempt===3){if(active)setError(e.message);return;}await new Promise(r=>setTimeout(r,750));}}};void load();return()=>{active=false;};},[]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(t);},[notice]);
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')setModal('');};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
 /** The workspace is re-read whether the call succeeded or not.

     Reloading only on success was the reason a mailbox could exist on the server while the screen
     still showed nothing: connecting creates the mailbox and then checks it, so a check that
     failed — or a request that was cut off after the mailbox had already been created — threw
     before the reload, and the interface kept the state it had before the mailbox existed. What
     the server did is not conditional on what the caller heard back, so the refresh must not be
     either. */
 const run=async(fn:()=>Promise<unknown>,message?:string)=>{setBusy(true);setError('');
  try{await fn();if(message)setNotice(message);}
  catch(e:any){setError(e.message);}
  finally{await reload().catch(()=>{});setBusy(false);}};
 const go=(p:string)=>{setPage(p);setQuery('');setMenu(false);};
 const superadmin=account?.role==='superadmin';
 const menuItems=superadmin?[...navigation,['Аккаунты',Users] as const]:navigation;
 const [accounts,setAccounts]=useState<any[]>([]);
 const [platform,setPlatform]=useState<any>(null);
 const [step,setStep]=useState(0);
 const create=()=>{setDraftLocation(emptyLocation());setModal('create');};
 const match=(s:string)=>s.toLowerCase().includes(query.toLowerCase());
 if(!state)return localize(<div className="gate"><div className="gate-card">
 <div className="gate-brand"><ChartNoAxesCombined size={29}/><span>Монетизатор<span className="brand-sub">by sendina</span></span></div>
 {loginState?.status==='logged'?<><h2>Ссылка в журнале сервера</h2><p data-user-content>{loginState.message}</p><p className="tiny muted">Так можно войти первому суперадмину до настройки системной почты.</p></>
 :loginState?.status==='sent'?<><h2>Проверьте почту</h2><p data-user-content>{loginState.message}</p>
   <button className="wide secondary" onClick={()=>setLoginState(null)}>Отправить ещё раз</button></>
 :loginState?.status==='pending'?<><h2>Заявка принята</h2><p data-user-content>{loginState.message}</p>
   <p className="tiny muted">Администратор получит уведомление. После подтверждения придёт письмо со ссылкой для входа.</p></>
 :loginState?.status==='blocked'?<><h2>Доступ закрыт</h2><p data-user-content>{loginState.message}</p></>
 :error&&!loginState?<><h2>Вход в Sendina</h2><p>Не удалось подключиться к серверу.</p>
   <div className="alert error" role="alert">{error}</div>
   <button className="wide secondary" onClick={()=>{setError('');void reload().catch(e=>setError(e.message));}}>Повторить</button></>
 :<><h2>Вход в Sendina</h2>
   <p>Введите рабочий адрес. Мы пришлём ссылку для входа — пароль не нужен. Новым аккаунтам доступ открывает администратор.</p>
   {arrival==='expired'&&<div className="alert error" role="alert">Ссылка для входа устарела. Запросите новую.</div>}
   {error&&<div className="alert error" role="alert">{error}</div>}
   <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
     setBusy(true);setError('');
     api('/auth/request',{email:f.get('email')})
      .then(r=>setLoginState(r))
      .catch(err=>setError(err.message))
      .finally(()=>setBusy(false));}}>
    <label>Рабочий адрес<input name="email" type="email" required autoFocus placeholder="name@company.com"/></label>
    <button className="wide" disabled={busy}>Прислать ссылку для входа</button></form></>}
 <div className="gate-foot">
  <button className="text-link" onClick={()=>{localStorage.setItem('sendina-api-url','');location.reload();}}>Посмотреть демонстрацию<ArrowRight size={12}/></button>
  <button className="text-link" aria-label="Язык интерфейса" onClick={()=>setLocale(locale==='ru'?'en':'ru')}><Globe size={13}/>{locale.toUpperCase()}</button></div>
</div></div>,locale);

 const campaigns=state.campaigns.filter(c=>match(c.name+' '+c.market));
 const ready=state.domains.some(d=>domainReadiness(d,state.stopped).ready);
 const link=(label:string,target:string)=><button className="text-link" onClick={()=>go(target)}>{label}<ArrowRight size={14}/></button>;
 const openMail=()=>{go('Настройки');setSection('mail');};
 const header=(Icon:any,title:string,action?:React.ReactNode)=><div className="card-heading"><h3><Icon size={18}/>{title}</h3>{action}</div>;
 const campaignTable=(compact=false)=><div className="table-scroll"><table><thead><tr><th>Цель</th><th>Рынок</th><th>Состояние</th><th>Результат</th>{!compact&&<th/>}</tr></thead><tbody>{campaigns.map(c=><tr key={c.id}><td><button className="row-link" onClick={()=>{setSelected(c.id);setModal('campaign');}} data-user-content>{c.name}</button>{!compact&&<small data-user-content>{c.event}</small>}</td><td><Flag market={c.market}/><span data-user-content>{c.market}</span></td><td><span className={'badge '+c.status}>{c.status==='active'?'Активна':c.status==='paused'?'На паузе':'Черновик'}</span></td><td>{c.positive} ответов <span className="muted">· {c.sent?(c.positive/c.sent*100).toFixed(1):'0'}%</span></td>{!compact&&<td><button className="icon-button" disabled={busy} aria-label={c.status==='active'?'Приостановить':'Активировать'} onClick={()=>run(()=>api(`/campaigns/${c.id}/status`,{status:c.status==='active'?'paused':'active'}),'Статус кампании обновлён')}>{c.status==='active'?<Pause size={16}/>:<Play size={16}/>}</button></td>}</tr>)}</tbody></table>{!campaigns.length&&<div className="empty">Кампаний пока нет. Создайте первую рассылку — или начните с «Возможностей».</div>}</div>;

 /** The mailbox screen, unchanged in what it does, now living inside Settings. */
 const mailSection=<>
  <div className="info-banner"><ShieldCheck size={24}/><div><b>Ящик готов только после тестовой отправки</b>
   <p>Введите рабочий адрес — Sendina сама определит провайдера. Технические параметры SMTP и IMAP нужны
    только в расширенной настройке, если определить автоматически не удалось.</p></div>
   <button onClick={()=>{setDetection(null);setAdvanced(false);setExpert(false);setModal('connect');}}><Plus size={16}/>Подключить ящик</button></div>
  {/* A check always ends, and this is where it says how. Four steps, in the order they were
      attempted, each with its own outcome — so "не сработало" is never the whole answer. */}
  {check&&<section className={'card full-card check-result '+(check.ready?'ok':'failed')}>
   <div className="card-heading"><h3>{check.ready?<Check size={18}/>:<X size={18}/>}
    Проверка ящика <span data-user-content>{check.email}</span></h3>
    <span className={'badge '+(check.ready?'active':'draft')}>{check.ready?'Готов':`Остановилась: ${check.failedStepLabel||'—'}`}</span></div>
   <div className="padded">
    <ol className="check-steps">{checkLabels.map(([key,label])=>{
      const step=check.checks?.[key];const status=step?.status??'none';
      return <li key={key} className={status}>
       <span className="check-step-name">{status==='ok'?<Check size={13}/>:status==='failed'?<X size={13}/>:<span className="check-dot"/>}{label}</span>
       <span className="tiny muted" data-user-content>{step?.detail||'—'}</span>
       {step?.code&&step.code!=='OK'&&<code className="tiny">{step.code}</code>}</li>;})}</ol>
    {!check.ready&&<p className="tiny muted">Причина: <code>{check.reason||'FAILED'}</code>.
     {check.reason==='TIMEOUT'&&' Сервер прервал шаг по таймауту — узел принял соединение, но не ответил. Проверьте host, порт и шифрование.'}
     {check.reason==='AUTH_REJECTED'&&' Провайдер отклонил пароль. Для Gmail и Microsoft 365 нужен пароль приложения, а не обычный пароль аккаунта.'}
     {check.reason==='HOST_NOT_FOUND'&&' Узел не найден в DNS — проверьте имя сервера.'}</p>}
    <button className="text-link" onClick={()=>setCheck(null)}>Скрыть результат</button></div></section>}
  {/* Whether a real message could leave, stated once and read from the server. Every screen and
      every connector reads this same answer, so none of them can disagree about it. */}
  {sender&&<section className={'card full-card send-state '+(sender.sendingEnabled?'ok':'blocked')}>
   <div className="card-heading"><h3><Send size={18}/>Готовность к отправке</h3>
    <span className={'badge '+(sender.sendingEnabled?'active':'draft')}>
     {sender.sendingEnabled?'Отправка возможна':blockers[sender.sendingBlocker]??'Отправка невозможна'}</span></div>
   <div className="padded">
    {sender.sender
     ?<p className="muted">Письма уйдут через <b data-user-content>{sender.sender.email}</b>.</p>
     :<p className="muted">Ни один ящик пока не прошёл все четыре проверки, поэтому отправлять не через что.</p>}
    {sender.allowance&&<p className="tiny muted">Суточный лимит домена: израсходовано {sender.allowance.used} из {sender.allowance.limit},
     осталось {sender.allowance.remaining}.</p>}
    {!sender.deployment?.sendingAllowed&&<div className="alert error" role="alert">
     Отправка выключена на этом развёртывании. Её включает администратор переменной окружения <code>SENDING_ENABLED=1</code>.</div>}
    {sender.deployment?.allowlist&&<div className="info-banner compact"><ShieldCheck size={20}/><div>
     <b>Контролируемая отправка</b>
     <p className="tiny">Письма могут уйти только на эти адреса, что бы ни было в кампании:
      <span data-user-content> {sender.deployment.allowlist.join(', ')}</span>.</p></div></div>}
    {sender.blockers?.length>0&&<ul className="blockers">{sender.blockers.map((b:string)=>
     <li key={b}>{blockers[b]??b}</li>)}</ul>}
   </div></section>}
  {!state.domains.length&&<div className="empty card">Ящики не подключены. Пока Sendina не может отправить ни одного письма.</div>}
  <div className="ideas-grid">{state.domains.map(d=>{const dr=domainReadiness(d,state.stopped);return <section className="card" key={d.id}>
   <div className="card-heading"><h3><Shield size={18}/><span data-user-content>{d.name}</span></h3>
    <span className={'badge '+(dr.ready?'active':'draft')}>{dr.ready?'Готов к отправке':'Не готов'}</span></div>
   <div className="mailbox-list">{d.mailboxes.map((m:any)=>{const mr=mailboxReadiness(d,m,state.stopped);return <div className="mailbox" key={m.email}>
    <div className="mailbox-head"><b data-user-content>{m.email}</b>
     <span className={'badge '+(mr.ready?'active':'draft')}>{mr.ready?'Готов':'Не готов'}</span></div>
    <small>{providers[m.provider]??providers.unknown} · {connections[m.connection]}</small>
    {m.transport&&<p className="tiny muted" data-user-content>{m.transport.label} · SMTP {m.transport.smtp.host}:{m.transport.smtp.port} · IMAP {m.transport.imap.host}:{m.transport.imap.port}</p>}
    {m.connection!=='none'&&<div className="check-row">{checkLabels.map(([key,label])=>{
      const value=(m as any)[key]?.status??'none';
      return <span key={key} className={'check '+value} title={(m as any)[key]?.detail||''}>
       {value==='ok'?<Check size={11}/>:value==='failed'?<X size={11}/>:<span className="check-dot"/>}{label}</span>;})}</div>}
    {mr.blockers.length>0&&<ul className="blockers">{mr.blockers.map((b:string)=><li key={b}>{blockers[b]??b}</li>)}</ul>}
    <div className="mailbox-actions">
     {m.connection==='none'
      ?<button className="secondary small-button" onClick={()=>{setDetection(null);setAdvanced(false);setExpert(false);setModal('connect');}}>Подключить</button>
      :<><button className="secondary small-button" disabled={busy}
         onClick={()=>run(async()=>{setCheck(null);const r=await api('/mailboxes/verify',{email:m.email});
          setCheck({email:m.email,...r});
          setNotice(r.ready?`Ящик ${m.email} проверен и готов.`
           :`Проверка ${m.email} остановилась на шаге «${r.failedStepLabel||'—'}» (${r.reason||'FAILED'}).`);})}>Проверить ящик</button>
        <button className="secondary small-button" disabled={busy}
         onClick={()=>run(async()=>{const r=await api('/mailboxes/sync',{email:m.email});
          setNotice(`Принято ответов: ${r.added}, без совпадения: ${r.unmatched}`);})}>Принять ответы</button>
        <button className="text-link" disabled={busy} onClick={()=>run(()=>api('/mailboxes/disconnect',{email:m.email}),'Ящик отключён')}>Отключить</button></>}
    </div></div>;})}</div>
   <div className="card-footer domain-foot">
    <button className="secondary" disabled={busy} onClick={()=>{setSelected(d.id);setModal('dns');}}><RefreshCw size={14}/>Проверить DNS</button>
    {/* A sending allowance is a judgement about the reputation of this domain, so it starts at
        zero and only an operator raises it. Until then the rules refuse every message. */}
    <form className="allowance" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
      run(()=>api(`/domains/${d.id}/limit`,{limit:Number(f.get('limit'))}),'Суточный лимит домена сохранён');}}>
     <label>Писем в сутки<input name="limit" type="number" min={0} max={2000} defaultValue={d.limit??0}/></label>
     <button className="secondary small-button" disabled={busy}>Сохранить лимит</button>
     <span className="tiny muted">Отправлено сегодня: {d.used??0}</span></form>
    <span className="tiny muted">{d.dns?.checkedAt?`SPF ${d.dns.spf?'есть':'нет'} · DKIM ${d.dns.dkim?'есть':'нет'} · DMARC ${d.dns.dmarc?'есть':'нет'}`:'DNS не проверялся'}</span>
   </div></section>;})}</div></>;

 /** Platform-wide credentials. This is a superadmin form and it lives on the Accounts screen. */
 const platformForm=<section className="card full-card">{header(Shield,'Приложения платформы',
   <span className="subtle-tag">{platform?.google?.configured||platform?.microsoft?.configured?'Настроено':'Не настроено'}</span>)}
  <div className="padded"><p className="muted">Модель, веб-поиск и поиск организаций настраиваются здесь один раз — для всех аккаунтов.
    Обычный пользователь не вводит платформенных ключей вообще.</p>
   <button className="secondary small-button" disabled={busy} onClick={()=>run(async()=>setPlatform(await api('/platform')))}>
    <RefreshCw size={14}/>Загрузить текущие настройки</button>
   <p className="tiny muted">Адрес возврата для Google и Microsoft: <code>{(backendUrl()||location.origin)+'/oauth/mailbox/callback'}</code></p>
   <p className="tiny muted">Шифрование секретов: {platform?.encryption==='environment'?'ключ из переменных окружения':'ключ создан сервером — задайте ENCRYPTION_KEY для более надёжного варианта'}</p>
   <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
     run(async()=>{await api('/platform',{google:{clientId:String(f.get('gid')||''),clientSecret:String(f.get('gsecret')||'')},
       microsoft:{clientId:String(f.get('mid')||''),clientSecret:String(f.get('msecret')||''),tenant:String(f.get('mtenant')||'')},
       openaiKey:String(f.get('openaiKey')||''),openaiModel:String(f.get('openaiModel')||''),
       searchProvider:String(f.get('searchProvider')||''),searchKey:String(f.get('searchKey')||''),
       placesProvider:String(f.get('placesProvider')||''),placesKey:String(f.get('placesKey')||'')});
      setPlatform(await api('/platform'));},'Приложения платформы сохранены');}}>
    <div className="form-row"><label>Google client ID<input name="gid" placeholder={platform?.google?.configured?'Заполнено':''}/></label>
     <label>Google client secret<input name="gsecret" type="password" placeholder={platform?.google?.configured?'Заполнено':''}/></label></div>
    <div className="form-row"><label>Microsoft client ID<input name="mid" placeholder={platform?.microsoft?.configured?'Заполнено':''}/></label>
     <label>Microsoft client secret<input name="msecret" type="password" placeholder={platform?.microsoft?.configured?'Заполнено':''}/></label></div>
    <label>Тенант Microsoft<input name="mtenant" defaultValue={platform?.microsoft?.tenant??'common'}/></label>
    <h3 className="platform-heading">Инфраструктура поиска и модели</h3>
    <div className="form-row"><label>Ключ модели<input name="openaiKey" type="password" placeholder={platform?.openai?.configured?'Заполнено':''}/></label>
     <label>Модель<input name="openaiModel" defaultValue={platform?.openai?.model??''}/></label></div>
    <div className="form-row"><label>Поиск в интернете<select name="searchProvider" defaultValue={platform?.search?.provider??''}>
      <option value="">Не подключён</option><option value="brave">Brave</option><option value="tavily">Tavily</option><option value="serper">Serper</option></select></label>
     <label>Ключ поиска<input name="searchKey" type="password" placeholder={platform?.search?.configured?'Заполнено':''}/></label></div>
    <h3 className="platform-heading">Поиск организаций
     <span className={'badge '+(platform?.places?.configured?'active':'draft')} style={{marginLeft:'9px'}}>
      {platform?.places?.configured?'Настроено':'Не настроено'}</span></h3>
    <p className="tiny muted">Справочник реальных организаций для подбора адресатов. Это <b>не</b> Google Workspace:
     отдельное приложение и отдельный ключ. Нужен Places API (New), включённый в проекте Google Cloud.
     Ключ хранится зашифрованным и обратно в интерфейс не возвращается.</p>
    <div className="form-row"><label>Провайдер<select name="placesProvider" defaultValue={platform?.places?.provider??''}>
      <option value="">Не подключён</option><option value="google">Google</option></select></label>
     <label>Google Places API key<input name="placesKey" type="password" placeholder={platform?.places?.configured?'Заполнено':''}/></label></div>
    <button disabled={busy}>Сохранить настройки платформы</button></form></div></section>;

 return <LocaleContext.Provider value={locale}>{localize(<div className="app"><aside className={menu?'sidebar open':'sidebar'}><a className="brand" href="#" onClick={e=>{e.preventDefault();go('Главная');}}><ChartNoAxesCombined size={29}/><span>Монетизатор<span className="brand-sub">by sendina</span></span></a><nav>{menuItems.map(([label,Icon])=><button key={label} aria-label={label} aria-current={page===label?'page':undefined} className={page===label?'nav-item selected':'nav-item'} onClick={()=>go(label)}><Icon size={20}/>{label}{label==='Ответы'&&state.replies.length>0&&<span className="nav-count">{state.replies.length}</span>}</button>)}</nav><div className="safety"><Shield size={20}/><strong>Безопасная отправка</strong><p>Контролируйте объём отправок и репутацию ваших доменов на каждом этапе.</p><button className="text-link" onClick={openMail}>Подробнее<ArrowRight size={14}/></button><div className="safety-foot"><span className="dot"/> Защита включена</div></div><div className="workspace"><div className="avatar small" aria-hidden="true">{(account?.email??'A')[0].toUpperCase()}</div>
 <div>{account?.email?<b data-user-content>{account.email}</b>:<b>Моя рабочая область</b>}
  <small>{superadmin?'Суперадмин':browserDemo()?'Демонстрационный режим':'Рабочая область аккаунта'}</small></div>
 {account&&<button className="icon-button" aria-label="Выйти" onClick={()=>{void api('/auth/logout').catch(()=>{});setSession('');location.reload();}}><Power size={15}/></button>}</div></aside>
 <div className="main-shell"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Открыть меню" onClick={()=>setMenu(!menu)}><Menu/></button><label className="search"><Search size={17}/><input aria-label="Поиск" placeholder="Поиск по рабочей области" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌕</kbd></label><div className="top-actions"><button className="locale-switch" aria-label="Язык интерфейса" onClick={()=>setLocale(locale==='ru'?'en':'ru')}><Globe size={14}/>{locale.toUpperCase()}</button><span className={'system '+(state.stopped?'halted':'')}><span className="status-icon">{state.stopped?<Pause size={11}/>:<Check size={11}/>}</span>{state.stopped?'Отправки остановлены':ready?'Отправитель готов':'Отправитель не подключён'}</span><button className="icon-button notification" aria-label="Журнал уведомлений" onClick={()=>setModal('audit')}><Bell size={20}/><i/></button><button className="profile" onClick={()=>go('Настройки')}><span className="avatar">A</span><ChevronDown size={14}/></button></div></header>
 <main><div className="breadcrumb">Рабочая область <ChevronRight size={12}/> <span>{page}</span></div><div className="page-title"><div><h1>{page==='Главная'?'Что вы хотите получить сегодня?':page}</h1><p>{page==='Главная'?'От первой идеи до измеримого результата — в одной системе.':({Рассылки:'Ваши цели, эксперименты и результаты в одном месте.',Возможности:'Что стоит продавать в выбранной точке прямо сейчас.',Рынки:'Где продавать то, что у вас есть.',Ответы:'Все диалоги и следующие действия вашей команды.',Аналитика:'Оптимизируйте результат, а не количество отправок.',Настройки:'Почта, интеграции, исключения и рабочая область.',Аккаунты:'Доступ, подтверждение и режим поддержки.'} as Record<string,string>)[page]}</p></div>{page==='Рассылки'?<button onClick={create}><Plus size={16}/>Создать рассылку</button>:page==='Главная'?<span className="date">{new Date().toLocaleDateString(locale==='ru'?'ru-RU':'en-US',{day:'numeric',month:'long',year:'numeric'})}</span>:null}</div>
 {browserDemo()&&<div className="demo-banner"><Info size={14}/>Демо в браузере · данные хранятся на этом устройстве<button className="text-link" onClick={()=>{go('Настройки');setSection('server');}}>Подключить сервер<ArrowRight size={12}/></button></div>}
 {state.demo&&!browserDemo()&&<div className="demo-banner"><Info size={14}/>Демонстрационный режим · кампании, ответы и показатели — примеры<button className="text-link" onClick={()=>run(()=>api('/demo',{enabled:false}),'Демонстрационные данные удалены')}>Очистить рабочую область<ArrowRight size={12}/></button></div>}
 {error&&<div className="alert error" role="alert">{error}<button className="icon-button" onClick={()=>setError('')} aria-label="Закрыть ошибку"><X size={16}/></button></div>}

 {page==='Главная'&&<><section className="scenario-grid">
 <article className="scenario blue recommended"><span className="scenario-tag">Рекомендуем</span>
  <div className="scenario-art"><Target size={38} strokeWidth={1.7}/></div>
  <h2>Сделать всё за меня</h2>
  <p>Опишите продукт и цель. Sendina сама найдёт компании и адресатов, проверит источники и подготовит персональные письма.</p>
  <p className="scenario-need">От вас: описание продукта и подтверждение первой партии.</p>
  <button onClick={()=>{setDraftLocation(emptyLocation());setGuided({step:'brief',mode:'auto'});setModal('guided');}}>Начать<ArrowRight size={16}/></button></article>
 <article className="scenario green">
  <div className="scenario-art"><Users size={38} strokeWidth={1.7}/></div>
  <h2>У меня уже есть адресаты</h2>
  <p>Загрузите свои контакты. Поиск компаний пропускается, всё остальное — проверка, письма, правила, ответы — работает так же.</p>
  <p className="scenario-need">От вас: список адресатов с источником и причиной обращения.</p>
  <button onClick={()=>{setDraftLocation(emptyLocation());setGuided({step:'brief',mode:'contacts'});setModal('guided');}}>Загрузить контакты<ArrowRight size={16}/></button></article>
 <article className="scenario amber">
  <div className="scenario-art"><Lightbulb size={38} strokeWidth={1.7}/></div>
  <h2>Я ещё не выбрал, что продавать</h2>
  <p>Задайте страну или отрасль — Sendina исследует и предложит шесть актуальных возможностей с оценкой и обоснованием.</p>
  <p className="scenario-need">От вас: территория или направление, остальное необязательно.</p>
  <button onClick={()=>go('Возможности')}>Искать возможности<ArrowRight size={16}/></button></article>
</section>
<section className="stats">
 <article className="stat"><div className="stat-icon blue-icon"><ShieldCheck/></div><div><span>Готовность отправителя</span>
  <h2 className="text-value">{ready?'Готов':'Не готов'}</h2>
  <p>{ready?'Ящик подключён и проверен':'Подключите и проверьте почтовый ящик'}</p></div></article>
 <article className="stat"><div className="stat-icon green-icon"><MessageCircle/></div><div><span>Ответов получено</span>
  <h2>{state.replies.length}</h2><p>{state.replies.length?'Смотрите ветки в разделе «Ответы»':'Ответы появятся после первых отправок'}</p></div></article>
 <article className="stat"><div className="stat-icon purple-icon"><Send/></div><div><span>Кампаний</span>
  <h2>{state.campaigns.length}</h2><p>{state.campaigns.filter(c=>c.status==='active').length} активны</p></div></article>
 <article className="stat"><div className="stat-icon amber-icon"><Star/></div><div><span>В избранном</span>
  <h2>{state.favourites.length}</h2><p>Сохранённые возможности и рынки</p></div></article></section>
<div className="dashboard-grid"><div className="column">
 <section className="card next-action">{header(Target,'Следующее лучшее действие',<span className="ai-label">РЕКОМЕНДАЦИЯ</span>)}<div className="next-body"><ol>
  {!state.campaigns.length&&<li>Найти возможность или создать первую кампанию</li>}
  {!ready&&<li>Подключить и проверить почтовый ящик</li>}
  {state.campaigns.length>0&&!state.contacts.length&&<li>Найти адресатов для кампании</li>}
  {state.contacts.length>0&&<li>Проверить письма и подтвердить первую партию</li>}
  {state.replies.length>0&&<li>Разобрать полученные ответы</li>}
 </ol><button className="small-button" onClick={()=>go(state.campaigns.length?'Рассылки':'Возможности')}>Перейти<ArrowRight size={14}/></button></div>
 <div className="card-note"><Info size={12}/> Первый тест поможет проверить гипотезу без масштабной рассылки</div></section>
 <section className="card">{header(Send,'Активные запуски',<span className="subtle-tag">{state.campaigns.filter(c=>c.status==='active').length} активны</span>)}{campaignTable(true)}<div className="card-footer">{link('Перейти ко всем рассылкам','Рассылки')}</div></section></div>
<div className="column">
 <section className="card">{header(Trophy,'Избранные возможности',link('Все возможности','Возможности'))}
  <div className="table-scroll">{state.favourites.length?<table><thead><tr><th>Название</th><th>Рынок</th><th>Оценка</th></tr></thead>
   <tbody>{state.favourites.slice(0,5).map(f=><tr key={f.id}><td data-user-content>{f.name}</td>
    <td><Flag market={f.market}/><span className="country" data-user-content>{f.market}</span></td>
    <td><b>{f.score}<span className="muted"> /100</span></b></td></tr>)}</tbody></table>
   :<div className="empty">Избранного пока нет. Исследуйте возможности и сохраните лучшие.</div>}</div>
  <div className="card-footer">{link('Исследовать возможности','Возможности')}</div></section>
 <section className="card">{header(Mail,'Домены и почта',<button className="text-link" onClick={openMail}>Управление<ArrowRight size={14}/></button>)}
  <div className="table-scroll">{state.domains.length?<table><thead><tr><th>Домен</th><th>Проверка</th></tr></thead>
   <tbody>{state.domains.map(d=>{const r=domainReadiness(d,state.stopped);return <tr key={d.id}>
    <td><b data-user-content>{d.name}</b>{d.mailboxes.map((m:any)=><small key={m.email} data-user-content>{m.email}</small>)}</td>
    <td><span className={'badge '+(r.ready?'active':'draft')}>{r.ready?'Готов':blockers[r.blockers[0]]??'Не готов'}</span></td></tr>;})}</tbody></table>
   :<div className="empty">Ящики не подключены.</div>}</div>
  <div className="card-footer"><button className="text-link" onClick={openMail}>Подключить почтовый ящик<ArrowRight size={14}/></button></div></section></div></div></>}

 {page==='Рассылки'&&<section className="card full-card">{header(Send,'Все кампании',<span className="subtle-tag">{campaigns.length}</span>)}{campaignTable()}</section>}
 {page==='Возможности'&&<Opportunities api={api} run={run} busy={busy} go={go}/>}
 {page==='Рынки'&&<Markets api={api} run={run} busy={busy} go={go}/>}
 {page==='Ответы'&&<Replies api={api} run={run} busy={busy} query={query}/>}
 {page==='Аналитика'&&<Analytics api={api} campaigns={state.campaigns.map(c=>({id:c.id,name:c.name}))}/>}
 {page==='Аккаунты'&&superadmin&&<Accounts api={api} run={run} busy={busy} platformForm={platformForm}/>}
 {page==='Аккаунты'&&!superadmin&&<div className="empty card">Этот раздел доступен только суперадминам.</div>}

 {page==='Настройки'&&<>
  <div className="tabs">{settingsSections.map(([id,label,Icon])=>
   <button key={id} className={section===id?'tab active-tab':'tab'} onClick={()=>setSection(id)}><Icon size={14}/>{label}</button>)}</div>

  {section==='mail'&&mailSection}

  {section==='integrations'&&<div className="settings-grid">
   <section className="card setting">{header(MessageCircle,'Коннектор ChatGPT')}
    <p>Управляйте Sendina из чата: ищите возможности, исследуйте рынки, создавайте кампании и смотрите результаты.
     Чат видит ровно те же данные, что и этот интерфейс.</p>
    <button className="secondary" onClick={()=>run(async()=>{setIntegration(await api('/integrations'));setModal('mcp');})}>
     Параметры подключения<ArrowRight size={15}/></button></section>
   <section className="card setting">{header(Search,'Подключения аккаунта')}
    <p>{caps?.provided?.model==='platform'
     ?'Модель и поиск предоставлены Sendina — вводить ключи не нужно. Эти поля пригодятся, только если вы хотите работать на своих.'
     :'Ключи модели и поиска пока не настроены администратором. До этого исследование и поиск адресатов работать не будут.'}</p>
    <div className="connection-status">
     {[['Модель',caps?.ai?.ready],['Поиск в интернете',caps?.search?.ready],['Поиск организаций',caps?.organisations?.ready]]
      .map(([label,ok])=><span key={String(label)} className={'badge '+(ok?'active':'draft')}>{label as string}</span>)}</div>
    <div className="button-stack">
     <button className="secondary" onClick={()=>{setStep(0);setModal('connections');}}>Свои ключи (расширенно)<ArrowRight size={15}/></button>
     <select aria-label="Режим поиска адресатов" value={state.settings?.recipientMode??'auto'} disabled={busy}
      onChange={e=>run(()=>api('/settings/recipients',{mode:e.target.value}),'Режим сохранён')}>
      <option value="auto">Автоматически</option><option value="organisations">Поиск организаций</option>
      <option value="search">Поиск в интернете</option><option value="proposal">Предложения модели</option></select></div>
   </section>

   {/* Organisation search is platform infrastructure with no per-account form, so it never
       appeared among the account connections above and looked simply absent. It is named here in
       its own right — and deliberately not next to Google Workspace, which is mail and a wholly
       separate application and key. */}
   <section className="card setting">{header(Globe,'Поиск организаций',
     <span className={'badge '+(caps?.organisations?.ready?'active':'draft')}>
      {caps?.organisations?.ready?'Настроено':'Не настроено'}</span>)}
    <p>Первый слой подбора адресатов: реальные организации из справочника, до того как что-либо ищет человека
     или адрес. Провайдер — Google Places. Это платформенная настройка: ключ задаётся один раз для всех
     аккаунтов, отдельных полей у аккаунта здесь нет.</p>
    <p className="tiny muted">К Google Workspace отношения не имеет: это разные приложения и разные ключи.
     Google Workspace — подключение почтового ящика, Google Places — справочник организаций.</p>
    {superadmin
     ?<button className="secondary" onClick={()=>go('Аккаунты')}>
       Настроить на экране «Аккаунты»<ArrowRight size={15}/></button>
     :<p className="tiny muted">Провайдер: {caps?.organisations?.provider||'не выбран'}.
       Настраивает администратор Sendina.</p>}
   </section></div>}

  {section==='exclusions'&&<section className="card full-card">{header(Ban,'Запрещённые адресаты',
    <span className="subtle-tag">{state.suppressed.length}</span>)}
   <div className="padded">
    <p className="muted">Этим адресам и доменам Sendina не отправляет ничего и никогда. Отказ и отписка попадают сюда
     автоматически и действуют во всех кампаниях рабочей области.</p>
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const form=e.currentTarget;
      run(()=>api('/suppress',{email:f.get('email')}),'Адресат исключён').then(()=>form.reset());}}>
     <label>Адрес<input type="email" name="email" placeholder="email@company.com" required/></label>
     <button disabled={busy}>Добавить в запрещённые</button></form>
    <div className="suppressed">{state.suppressed.map(e=><span key={e} data-user-content>{e}</span>)}</div>
    {!state.suppressed.length&&<div className="empty">Список пуст.</div>}
   </div></section>}

  {section==='workspace'&&<div className="settings-grid">
   <section className="card setting">{header(Globe,'Язык интерфейса')}
    <p>Текст и данные пользователя сохраняются на исходном языке.</p>
    <select aria-label="Язык интерфейса" value={locale} onChange={e=>setLocale(e.target.value as Locale)}>
     <option value="ru">Русский</option><option value="en">Английский</option></select></section>
   <section className="card setting">{header(Power,'Управление отправками')}
    <p>Аварийная остановка приостанавливает все активные кампании. После снятия остановки возобновляйте их по отдельности.</p>
    <button className={state.stopped?'secondary':'danger'} disabled={busy}
     onClick={()=>run(()=>api('/stop',{stopped:!state.stopped}),state.stopped?'Остановка снята. Кампании остаются на паузе.':'Все кампании приостановлены')}>
     <Power size={16}/>{state.stopped?'Снять аварийную остановку':'Остановить все кампании'}</button></section>
   <section className="card setting">{header(CalendarDays,'Журнал действий')}
    <p>Создание кампаний, исследования, проверки и изменения состояния сохраняются с датой и идентификатором.</p>
    <button className="secondary" onClick={()=>setModal('audit')}>Открыть журнал<ArrowRight size={15}/></button></section>
   <section className="card setting">{header(Info,'Демонстрационные данные')}
    <p>{state.demo
     ?'В рабочей области сейчас демонстрационные кампании, ответы и показатели. Очистите её, прежде чем работать по-настоящему.'
     :'Рабочая область содержит только ваши собственные данные. Демонстрацию можно включить, чтобы посмотреть, как выглядит заполненная система.'}</p>
    <button className={state.demo?'danger':'secondary'} disabled={busy}
     onClick={()=>run(()=>api('/demo',{enabled:!state.demo}),state.demo?'Демонстрационные данные удалены':'Демонстрационный режим включён')}>
     {state.demo?'Очистить рабочую область':'Включить демонстрацию'}</button></section>
  </div>}

  {section==='server'&&<div className="settings-grid">
   {superadmin
    ?<><section className="card setting">{header(Server,'Сервер приложения')}
      <p>{browserDemo()?'Данные сохраняются только в этом браузере. Для общей рабочей области подключите сервер.':'Подключение к серверной рабочей области.'}</p>
      <form onSubmit={e=>{e.preventDefault();run(async()=>{const url=serverDraft.trim().replace(/\/$/,'');if(url&&new URL(url).protocol!=='https:')throw Error('Укажите HTTPS-адрес сервера.');localStorage.setItem('sendina-api-url',url);await reload();},'Адрес сервера сохранён');}}>
       <input aria-label="HTTPS-адрес сервера" type="url" placeholder="https://api.example.com" value={serverDraft} onChange={e=>setServerDraft(e.target.value)}/>
       <button disabled={busy}>Сохранить</button></form></section>
     <section className="card setting">{header(Shield,'Состояние хранилища')}
      <p>{caps?.storage?.postgres?'PostgreSQL подключён: данные переживают передеплой.':'Хранилище — файл контейнера. Подключите PostgreSQL, иначе данные пропадут при передеплое.'}</p>
      <span className={'badge '+(caps?.storage?.postgres?'active':'draft')}>{caps?.storage?.postgres?'PostgreSQL':'Файл контейнера'}</span></section></>
    :<section className="card setting">{header(Server,'Сервер приложения')}
      <p>Адрес сервера, служебные токены и состояние хранилища — администраторская информация. Если что-то не работает,
       обратитесь к администратору Sendina.</p>
      <span className={'badge '+(caps?.storage?.durable?'active':'draft')}>
       {caps?.storage?.durable?'Рабочая область сохраняется':'Хранилище не настроено'}</span></section>}
   {browserDemo()&&<section className="card setting">{header(Server,'Подключить сервер')}
    <p>Сейчас открыта демонстрация в браузере. Укажите адрес сервера, чтобы войти под своим аккаунтом.</p>
    <form onSubmit={e=>{e.preventDefault();run(async()=>{const url=serverDraft.trim().replace(/\/$/,'');localStorage.setItem('sendina-api-url',url);location.reload();});}}>
     <input aria-label="HTTPS-адрес сервера" type="url" placeholder="https://api.example.com" value={serverDraft} onChange={e=>setServerDraft(e.target.value)}/>
     <button disabled={busy}>Подключить</button></form></section>}
  </div>}
 </>}

 <footer className="page-footer"><span><span className="dot"/> Sendina · ваш путь от идеи к результату</span><span>v0.2</span></footer></main></div>
 {notice&&<div className="toast" role="status"><Check size={18}/>{notice}<button className="icon-button" aria-label="Закрыть уведомление" onClick={()=>setNotice('')}><X size={15}/></button></div>}
 {modal&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal('');}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="close icon-button" aria-label="Закрыть" onClick={()=>setModal('')}><X/></button><h2 id="modal-title">{({guided:'Запуск кампании',connections:'Подключения аккаунта',connect:'Подключение ящика',recipients:'Адресаты кампании',confirm:'Подтверждение адресата',mcp:'Коннектор ChatGPT',create:'Новая рассылка',dns:'Проверка DNS',audit:'Журнал действий',campaign:'Управление кампанией',contacts:'Импорт адресатов',preview:'Предпросмотр писем',sendresult:'Результат отправки'} as Record<string,string>)[modal]}</h2>{error&&<div className="alert error" role="alert">{error}</div>}
 {modal==='mcp'&&integration&&<><p>Добавьте коннектор с этим адресом в ChatGPT. На экране согласия введите код коннектора — он привязывает чат ровно к вашему аккаунту.</p><div className="integration-details"><label>URL<input readOnly value={integration.mcp.endpoint}/></label>
  <label>Код коннектора<input readOnly type={connector?'text':'password'} value={connector||'••••••••'} onFocus={e=>e.currentTarget.select()}/></label>
  <div className="button-stack"><button className="secondary small-button" disabled={busy} onClick={()=>run(async()=>setConnector((await api('/settings/connector')).code))}>Показать код</button>
   <button className="text-link" disabled={busy} onClick={()=>run(async()=>setConnector((await api('/settings/connector',{})).code),'Код коннектора заменён')}>Создать новый</button></div>
  <p>Авторизация: <b>{integration.mcp.authentication}</b></p><p>Streamable HTTP · {integration.mcp.tools.length} tools</p>
  {superadmin&&<><label>Инструменты</label><ul>{integration.mcp.tools.map((tool:string)=><li key={tool}><code>{tool}</code></li>)}</ul></>}</div>
  <a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" target="_blank" rel="noreferrer">Инструкция подключения ↗</a></>}

 {modal==='create'&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
   run(async()=>{await api('/campaigns',{name:f.get('name'),goal:f.get('goal'),context:f.get('context'),
     event:f.get('event'),location:draftLocation});setModal('');go('Рассылки');},'Кампания создана. Добавьте адресатов для предпросмотра.');}}>
  <p className="muted">Задайте контекст и измеримое целевое событие.</p>
  <label>Название кампании<input name="name" autoFocus required minLength={3} maxLength={150} placeholder="Например, продажи решения для отелей"/></label>
  <div className="form-row"><label>Цель<select name="goal">{['Продажа услуги','Продажа продукта','Партнёрство','Поиск инвесторов','Найм','Закупки','Обращение','Другое'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Целевое событие<select name="event">{['Встреча','Положительный ответ','Квалифицированный интерес','Получение документа','Покупка','Пересмотр решения'].map(v=><option key={v}>{v}</option>)}</select></label></div>
  <LocationPicker value={draftLocation} onChange={setDraftLocation}/>
  <label>Продукт и контекст<textarea name="context" required minLength={10} maxLength={5000} rows={4} placeholder="Что вы предлагаете и какую задачу решаете? Используйте только проверяемые факты."/></label>
  <div className="info-banner compact"><ShieldCheck size={18}/>Кампания создаётся как черновик. Отправка отключена.</div>
  <button className="wide" disabled={busy}>Создать кампанию<ArrowRight size={16}/></button></form>}

 {modal==='connections'&&(()=>{
  const steps=[
   {key:'openai',title:'Модель',lead:'Обычно ключ предоставляет Sendina, и заполнять это поле не нужно. Укажите свой, только если хотите работать на собственном ключе.',
    done:caps?.connections?.openai?.configured,
    fields:[['openaiKey','Ключ OpenAI','password','sk-…'],['openaiModel','Модель','text','gpt-4.1-mini'],['aiGatewayUrl','Адрес шлюза (необязательно)','text','https://api.openai.com/v1']]},
   {key:'search',title:'Поиск адресатов',lead:'Тоже обычно предоставлено платформой. Свой ключ поиска нужен, только если вы хотите отделить свои запросы от общих.',
    done:caps?.connections?.search?.configured,
    fields:[['searchProvider','Провайдер','select',''],['searchKey','Ключ поискового API','password','']]},
   {key:'google',title:'Google Workspace',lead:'Обычно это заполняет администратор Sendina один раз на всю платформу, и вам ничего вводить не нужно. Эти поля — запасной вариант: своё приложение Google Cloud Console со scope gmail.send и gmail.readonly.',
    done:caps?.connections?.google?.configured,
    fields:[['google.clientId','Client ID','text',''],['google.clientSecret','Client secret','password','']]},
   {key:'microsoft',title:'Microsoft 365',lead:'Тоже обычно настраивает администратор платформы. Запасной вариант — своё приложение Entra ID со scope Mail.Send, Mail.Read и offline_access.',
    done:caps?.connections?.microsoft?.configured,
    fields:[['microsoft.clientId','Client ID','text',''],['microsoft.clientSecret','Client secret','password',''],['microsoft.tenant','Идентификатор тенанта','text','common']]}];
  const current=steps[Math.min(step,steps.length-1)];
  const redirect=`${backendUrl()||location.origin}/oauth/mailbox/callback`;
  return <>
   <ol className="wizard-steps">{steps.map((st,i)=><li key={st.key} className={i===step?'current':st.done?'done':''}>
    <button className="text-link" onClick={()=>setStep(i)}>{st.done?<Check size={12}/>:<span className="step-number">{i+1}</span>}{st.title}</button></li>)}</ol>
   <p className="muted">{current.lead}</p>
   {(current.key==='google'||current.key==='microsoft')&&<label>Адрес возврата (укажите его у провайдера)
    <input readOnly value={redirect} onFocus={e=>e.currentTarget.select()}/></label>}
   <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
     const patch:any={};
     for(const [name] of current.fields){const value=String(f.get(name)??'');
      if(name.includes('.')){const [group,field]=name.split('.');patch[group]={...patch[group],[field]:value};}
      else patch[name]=value;}
     run(async()=>{await api('/settings/connections',patch);setCaps(await api('/capabilities'));
      if(step<steps.length-1)setStep(step+1);else setModal('');},'Настройки сохранены');}}>
    {current.fields.map(([name,label,kind,placeholder])=>kind==='select'
     ?<label key={name}>{label}<select name={name} defaultValue={caps?.connections?.search?.provider??''}>
        <option value="">Не подключён</option><option value="brave">Brave</option><option value="tavily">Tavily</option><option value="serper">Serper</option></select></label>
     :<label key={name}>{label}<input name={name} type={kind} placeholder={placeholder}
        defaultValue={name==='openaiModel'?(caps?.connections?.openai?.model??''):name==='microsoft.tenant'?(caps?.connections?.microsoft?.tenant??''):name==='aiGatewayUrl'?(caps?.connections?.openai?.gateway??''):''}/></label>)}
    <p className="tiny muted">{current.done?'Уже заполнено. Пустое поле оставит сохранённое значение без изменений.':'Поля пока не заполнены.'}</p>
    <div className="button-stack">
     {step>0&&<button type="button" className="secondary" onClick={()=>setStep(step-1)}>Назад</button>}
     <button disabled={busy}>{step<steps.length-1?'Сохранить и далее':'Сохранить и закрыть'}</button>
     {step<steps.length-1&&<button type="button" className="text-link" onClick={()=>setStep(step+1)}>Пропустить шаг</button>}</div>
   </form></>;
 })()}

 {modal==='guided'&&guided&&(()=>{
  if(guided.step==='brief')return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
    const product=String(f.get('product')),problem=String(f.get('problem'));
    run(async()=>{
     let location=draftLocation;
     let why='';
     if(location.auto){
      const r=await api('/recommend-market',{context:product+'. '+problem,goal:String(f.get('goal'))});
      location={countries:[r.market],region:'',city:'',auto:false};why=r.why;
     }
     const campaign=await api('/campaigns',{name:product.slice(0,140),location,goal:String(f.get('goal')),
      context:product+'. Решаемая проблема: '+problem,event:String(f.get('event')),control:'confirm'});
     setGuided({...guided,step:guided.mode==='auto'?'research':'contacts',campaignId:campaign.id,market:campaign.market,why});});}}>
   <p className="muted">{guided.mode==='auto'
     ?'Четыре вопроса — и Sendina сама найдёт компании, адресатов и подготовит письма.'
     :'Опишите предложение, чтобы письма были персональными. Адресатов вы добавите на следующем шаге.'}</p>
   <label>Что продаём<input name="product" required autoFocus placeholder="Автоматизация брони для небольших отелей"/></label>
   <label>Какую проблему это решает<textarea name="problem" rows={2} required placeholder="Заявки теряются, ответы гостям пишут вручную"/></label>
   <div className="form-row">
    <label>Чего хотим добиться<select name="goal" defaultValue="Продажа услуги">
     <option>Продажа услуги</option><option>Партнёрство</option><option>Поиск инвесторов</option><option>Найм</option><option>Обращение</option></select></label>
    <label>Целевое событие<select name="event" defaultValue="Встреча">
     <option>Встреча</option><option>Положительный ответ</option><option>Демонстрация</option><option>Получение документа</option></select></label></div>
   <LocationPicker value={draftLocation} onChange={setDraftLocation}/>
   <button disabled={busy}>Продолжить<ArrowRight size={15}/></button></form>;

  if(guided.step==='research')return <>
   {guided.why&&<div className="info-banner compact"><Info size={20}/><div><b data-user-content>Рынок: {guided.market}</b><p data-user-content>{guided.why}</p></div></div>}
   <p className="muted">Sendina найдёт реальные организации, проверит источники и оставит адресатом только того, чей адрес подтверждается источником.</p>
   <div className="button-stack">
    <button disabled={busy} onClick={()=>run(async()=>{
      const found=await api('/campaigns/'+guided.campaignId+'/find',{count:20});
      const preview=await api('/campaigns/'+guided.campaignId+'/launch-preview',{limit:5});
      setGuided({...guided,step:'preview',found,preview});})}>Найти адресатов<Search size={15}/></button>
    <button className="secondary" onClick={()=>setGuided({...guided,step:'contacts'})}>Добавить своих</button></div></>;

  if(guided.step==='contacts')return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
    run(async()=>{const contacts=JSON.parse(String(f.get('contacts')));
     await api('/campaigns/'+guided.campaignId+'/contacts',{contacts});
     const preview=await api('/campaigns/'+guided.campaignId+'/launch-preview',{limit:5});
     setGuided({...guided,step:'preview',preview});});}}>
   <p className="muted">Вставьте адресатов списком JSON. Для каждого нужны источник, основание и конкретная причина обращения — без причины письмо будет помечено как спам.</p>
   <label>Адресаты<textarea name="contacts" rows={10} required placeholder='[{"email":"name@company.com","name":"Имя","company":"Компания","source":"https://company.com/contact","basis":"Опубликованный рабочий контакт","reason":"Конкретная причина обращения"}]'/></label>
   <button disabled={busy}>Проверить и показать письма<ArrowRight size={15}/></button></form>;

  const shown=guided.preview;
  return <>
   {guided.found&&<div className="info-banner compact"><Info size={20}/><div>
     <b>{guided.found.mode==='organisations'?'Поиск по реальным организациям':guided.found.mode==='search'?'Поиск в интернете':'Предложения модели'}</b>
     <p>Добавлено: {guided.found.added} · Подтверждено источником: {guided.found.verified}</p>
     {guided.found.notes?.map((n:string,i:number)=><p key={i} className="tiny" data-user-content>{n}</p>)}</div></div>}
   <p className="muted">Адресатов: {shown?.recipients??0}, из них подтверждено источником: {shown?.verified??0}. Ниже — первые письма целиком.</p>
   {!shown?.sample?.length?<div className="empty">Подходящих адресатов пока нет.</div>
    :shown.sample.map((m:any)=><article className={m.bulk?'preview-message flagged':'preview-message'} key={m.contactId}>
     <div className="preview-head"><h3 data-user-content>{m.name}{m.role&&<> · {m.role}</>}</h3>
      <span className={'badge '+(m.policy.decision==='allow'?'active':'draft')}>{reasons[m.policy.reason]??m.policy.reason}</span></div>
     <p className="tiny" data-user-content>{[m.company,m.country].filter(Boolean).join(' · ')} · {m.email||'адрес не подтверждён'}</p>
     <p className="tiny"><b>Почему выбран:</b> <span data-user-content>{m.reason}</span></p>
     {m.evidence&&<p className="tiny"><b>Доказательство:</b> <span data-user-content>{m.evidence}</span></p>}
     {m.source&&<a href={m.source} target="_blank" rel="noreferrer">Источник <ExternalLink size={12}/></a>}
     <p className="letter" data-user-content>{m.text}</p></article>)}
   <label>Как запускаем<select value={shown?.campaign?.control??'confirm'} disabled={busy}
     onChange={e=>run(async()=>{await api('/campaigns/'+guided.campaignId+'/control',{control:e.target.value});
      setGuided({...guided,preview:await api('/campaigns/'+guided.campaignId+'/launch-preview',{limit:5})});})}>
    <option value="confirm">Подтвердить первую партию</option>
    <option value="auto">Полностью автоматически</option>
    <option value="manual">Полностью вручную</option></select></label>
   {!ready&&<div className="alert error" role="alert">Отправитель не подключён. Правила не пропустят отправку, пока ящик не подключён и не проверен.
    <button className="text-link" onClick={()=>{setModal('');setGuided(null);openMail();}}>Подключить отправителя<ArrowRight size={12}/></button></div>}
   <div className="button-stack">
    <button disabled={busy} onClick={()=>run(async()=>{
      if((shown?.campaign?.control??'confirm')==='confirm')await api('/campaigns/'+guided.campaignId+'/approve',{});
      await api('/campaigns/'+guided.campaignId+'/status',{status:'active'});
      setModal('');setGuided(null);go('Рассылки');},'Кампания запущена. Отправка пойдёт в рамках правил.')}>
     Подтвердить и запустить</button>
    <button className="secondary" onClick={()=>{setModal('');setGuided(null);go('Рассылки');}}>Оставить черновиком</button></div></>;
 })()}

 {modal==='connect'&&(!detection
  ?<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
    run(async()=>setDetection(await api('/mailboxes/detect',{email:f.get('email')})));}}>
   <p className="muted">Введите рабочий адрес — Sendina определит провайдера сама. Это ещё не подключение.</p>
   <label>Рабочий e-mail<input name="email" type="email" required autoFocus placeholder="name@company.com"/></label>
   <button disabled={busy}>Определить провайдера</button></form>
  :<><div className="info-banner compact"><Info size={20}/><div>
    <b>{providers[detection.provider]??providers.unknown}</b>
    <p data-user-content>{detection.note}</p>
    {detection.mx?.length>0&&superadmin&&<p className="tiny" data-user-content>MX: {detection.mx.slice(0,3).join(', ')}</p>}</div></div>
   {detection.personal&&<div className="alert error" role="alert">Личный ящик. Рабочий сценарий — корпоративный домен организации; личный подходит только как тестовый случай.</div>}

   {/* Consent first, always. For Google and Microsoft this is the way in; the password route
        below it is the advanced one, and is only opened by hand or when there is no application. */}
   {detection.route==='oauth'&&<div className="button-stack">
    <button disabled={busy} onClick={()=>run(async()=>{const r=await api('/mailboxes/oauth',{email:detection.email});
     window.open(r.url,'_blank','noopener');setModal('');setDetection(null);},'Завершите согласие в открывшейся вкладке, затем проверьте ящик')}>
     Подключить через {detection.provider==='google'?'Google':'Microsoft'}</button>
    <span className="tiny muted">{detection.appOwner==='platform'?'Приложение Sendina — client id вводить не нужно.':'Используется приложение вашего аккаунта.'}</span></div>}

   {/* A missing platform application is the platform's problem. An ordinary person is told that
       plainly and offered the way that does work; a superadmin is told exactly where to fix it. */}
   {detection.route==='oauth-unconfigured'&&detection.blocker&&<div className="alert error" role="alert">
    {superadmin
     ?<><b>{detection.blocker.forSuperadmin}</b>
       <p>Подключение через {detection.provider==='google'?'Google':'Microsoft'} будет доступно всем аккаунтам сразу после того,
        как вы заполните {detection.blocker.where.field} в разделе «{detection.blocker.where.section}» на экране «Аккаунты».</p>
       <p className="tiny">Адрес возврата для приложения: <code>{detection.blocker.where.redirectUri}</code></p>
       <button className="secondary small-button" onClick={()=>{setModal('');setDetection(null);go('Аккаунты');}}>
        Настроить приложение платформы<ArrowRight size={14}/></button></>
     :<><b>Подключение через {detection.provider==='google'?'Google':'Microsoft'} пока недоступно.</b>
       <p>Приложение платформы ещё не настроено администратором Sendina. Пока этого не произошло, ящик можно
        подключить расширенным способом — по паролю приложения.</p></>}</div>}

   {/* The advanced route is offered for every provider, including the ones where consent is the
       first offer: somebody whose organisation will not grant consent still has to be able to
       connect their mailbox. It is folded away there, never removed. */}
   {(()=>{
     const found=detection.settings;
     const smtp=found?.smtp??{host:'',port:465,secure:true};
     const imap=found?.imap??{host:'',port:993,secure:true};
     // Where consent is the intended route, the password form stays folded away until asked for.
     if(detection.provider!=='smtp'&&!expert)return <button className="text-link" onClick={()=>setExpert(true)}>
       Расширенный способ подключения (SMTP и IMAP по паролю приложения)<ChevronRight size={13}/></button>;
     return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
       const asServer=(prefix:string)=>({host:String(f.get(prefix+'Host')),port:Number(f.get(prefix+'Port')),secure:f.get(prefix+'Secure')==='on'});
       run(async()=>{
        setCheck(null);
        try{
         const r=await api('/mailboxes/connect',{email:detection.email,
          smtp:asServer('smtp'),imap:asServer('imap'),user:String(f.get('user')||detection.email),
          pass:f.get('pass'),source:found?.source??'manual',label:found?.label??'Указано вручную'});
         // The mailbox now exists either way, so the form is finished with regardless of the
         // outcome of the four checks; the result is reported on the mail screen, not in here.
         setCheck({email:detection.email,...r});
         setNotice(r.ready?`Ящик ${detection.email} подключён и проверен.`
          :`Ящик ${detection.email} создан, но проверка не прошла: ${r.failedStepLabel||'—'} (${r.reason||'FAILED'}).`);
        }finally{setModal('');setDetection(null);setAdvanced(false);setExpert(false);}
       });}}>
      {found&&!advanced
       ?<div className="info-banner compact"><Check size={18}/><div><b>Настройки определены автоматически</b>
          <p className="tiny" data-user-content>{found.label}</p>
          <p className="tiny muted">SMTP {smtp.host}:{smtp.port} · IMAP {imap.host}:{imap.port}</p>
          <button type="button" className="text-link" onClick={()=>setAdvanced(true)}>Изменить вручную</button></div></div>
       :<><p className="muted">Расширенная настройка. Эти параметры есть в панели вашего почтового провайдера.</p>
         <div className="form-row"><label>SMTP host<input name="smtpHost" required defaultValue={smtp.host}/></label>
          <label>SMTP порт<input name="smtpPort" type="number" required defaultValue={smtp.port}/></label></div>
         <label className="switch"><input name="smtpSecure" type="checkbox" defaultChecked={smtp.secure}/>Шифрование TLS для SMTP</label>
         <div className="form-row"><label>IMAP host<input name="imapHost" required defaultValue={imap.host}/></label>
          <label>IMAP порт<input name="imapPort" type="number" required defaultValue={imap.port}/></label></div>
         <label className="switch"><input name="imapSecure" type="checkbox" defaultChecked={imap.secure}/>Шифрование TLS для IMAP</label></>}
      {found&&!advanced&&<><input type="hidden" name="smtpHost" value={smtp.host}/><input type="hidden" name="smtpPort" value={smtp.port}/>
        {smtp.secure&&<input type="hidden" name="smtpSecure" value="on"/>}
        <input type="hidden" name="imapHost" value={imap.host}/><input type="hidden" name="imapPort" value={imap.port}/>
        {imap.secure&&<input type="hidden" name="imapSecure" value="on"/>}</>}
      <label>Пользователь<input name="user" defaultValue={detection.email}/></label>
      <label>Пароль или пароль приложения<input name="pass" type="password" required/></label>
      <p className="tiny muted">Пароль шифруется на сервере и никогда не возвращается в интерфейс. После подключения Sendina проверит вход, отправку, приём и прочитает тестовое письмо обратно.</p>
      <button disabled={busy}>Подключить и проверить</button></form>;
    })()}
   <button className="text-link" onClick={()=>{setDetection(null);setAdvanced(false);setExpert(false);}}>Другой адрес</button></>)}

 {modal==='dns'&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{const c=await api(`/domains/${selected}/check`,{selector:f.get('selector')});setNotice(`SPF: ${c.spf?'найден':'не найден'} · DKIM: ${c.dkim?'найден':'не найден'} · DMARC: ${c.dmarc?'найден':'не найден'}`);setModal('');});}}><p>Домен: <b data-user-content>{state.domains.find(d=>d.id===selected)?.name}</b></p><label>DKIM selector<input name="selector" defaultValue="default" pattern="[a-zA-Z0-9_-]{1,63}" required/></label><p className="muted">Уточните selector у почтового провайдера. Наличие записей не подтверждает возможность отправки.</p><button disabled={busy}>Проверить DNS</button></form>}
 {modal==='audit'&&<div className="audit-list">{state.audit.map(a=><div key={a.id}><span className="audit-dot"/><div><p data-user-content>{a.action}</p><small>{new Date(a.at).toLocaleString(locale==='ru'?'ru-RU':'en-US')}</small></div></div>)}{!state.audit.length&&<div className="empty">Записей пока нет.</div>}</div>}

 {modal==='campaign'&&(()=>{const c=state.campaigns.find(c=>c.id===selected)!;
  const people=state.contacts.filter(p=>p.campaignId===c.id);
  const unconfirmed=people.filter(p=>p.verification==='unverified').length;
  const others=new Set(state.contacts.filter(p=>p.campaignId!==c.id).map(p=>p.email).filter(Boolean));
  const repeated=people.filter(p=>p.email&&others.has(p.email)).length;
  return <><h3 data-user-content>{c.name}</h3><p data-user-content>{c.context}</p>
  <p className="muted"><Flag market={c.market}/><span data-user-content>{c.market}</span> · Целевое событие: <span data-user-content>{c.event}</span></p>
  <div className="info-banner compact"><Info size={20}/><div>Адресатов: {people.length} · Писем: {state.messages.filter(m=>m.campaignId===c.id).length}{unconfirmed>0&&<> · Не подтверждено: {unconfirmed}</>}</div></div>
  {repeated>0&&<div className="alert error" role="alert">Повторяющихся адресов из других кампаний: {repeated}. Правила заблокируют их при подготовке писем.</div>}
  <div className="button-stack">
   <button disabled={busy} onClick={()=>run(async()=>{const r=await api(`/campaigns/${c.id}/find`,{count:20});setResearch(r);setModal('recipients');},'Поиск адресатов завершён')}><Search size={16}/>Найти адресатов</button>
   <button disabled={busy} onClick={()=>run(async()=>{setPreview(await api(`/campaigns/${c.id}/preview`,{limit:10}));setModal('preview');})}><Send size={16}/>Подготовить письма</button>
   <button className="secondary" onClick={()=>{setResearch(null);setModal('recipients');}}><Users size={16}/>Адресаты · {people.length}</button>
   <button className="secondary" onClick={()=>setModal('contacts')}>Импорт JSON</button>
  </div>

  {/* Sending, kept apart from everything above it, because it is the only action on this screen
      that a stranger can see the result of. The rehearsal comes first and is the safe one. */}
  {(()=>{const drafts=state.messages.filter(m=>m.campaignId===c.id&&m.status==='draft').length;
   const sent=state.messages.filter(m=>m.campaignId===c.id&&m.status==='sent').length;
   return <div className="send-block">
    <h3><Send size={16}/>Отправка</h3>
    <p className="tiny muted">Уходят только подготовленные письма — ровно те, что вы видели в предпросмотре.
     Правила проверяются заново для каждого письма в момент отправки.</p>
    <p className="tiny muted">Готово к отправке: {drafts} · Уже отправлено: {sent}</p>
    {c.status!=='active'&&<div className="alert error" role="alert">
     Кампания не активна: правила не пропустят ни одного письма. Активируйте её на экране «Рассылки».</div>}
    {sender&&!sender.sendingEnabled&&<div className="alert error" role="alert">
     {blockers[sender.sendingBlocker]??'Отправка невозможна'}.
     <button className="text-link" onClick={()=>{setModal('');openMail();}}>Открыть готовность к отправке<ArrowRight size={12}/></button></div>}
    <div className="button-stack">
     <button className="secondary" disabled={busy||!drafts}
      onClick={()=>run(async()=>{const r=await api(`/campaigns/${c.id}/send`,{dryRun:true});
       setSendRun(r);setModal('sendresult');},'Репетиция выполнена: ничего не отправлено')}>
      <Eye size={16}/>Репетиция без отправки</button>
     <button className="danger" disabled={busy||!drafts||!sender?.sendingEnabled}
      onClick={()=>run(async()=>{const r=await api(`/campaigns/${c.id}/send`,{});
       setSendRun(r);setModal('sendresult');
       setNotice(`Отправлено: ${r.sent}, заблокировано правилами: ${r.blocked}, ошибок: ${r.failed}`);})}>
      <Send size={16}/>Отправить по-настоящему</button></div>
   </div>;})()}</>;})()}

 {/* What a run actually did, message by message. A refusal names the rule that produced it. */}
 {modal==='sendresult'&&sendRun&&<>
  <div className={'info-banner compact '+(sendRun.dryRun?'':'sent')}><Info size={20}/><div>
   <b>{sendRun.dryRun?'Репетиция: ничего не отправлено':`Отправлено писем: ${sendRun.sent}`}</b>
   <p className="tiny">Отправитель: <span data-user-content>{sendRun.sender?.email}</span> ·
    В очереди было {sendRun.queued} · Заблокировано правилами {sendRun.blocked} · Ошибок {sendRun.failed}</p>
   {sendRun.allowlist&&<p className="tiny">Разрешённые адреса: <span data-user-content>{sendRun.allowlist.join(', ')}</span></p>}</div></div>
  <ol className="send-results">{sendRun.results.map((r:any)=>
   <li key={r.messageId} className={r.status}>
    <span className="send-address" data-user-content>{r.email}</span>
    <span className={'badge '+(r.status==='sent'?'active':r.status==='failed'?'paused':'draft')}>
     {r.status==='sent'?(sendRun.dryRun?'Прошло бы':'Отправлено'):r.status==='failed'?'Ошибка':'Заблокировано'}</span>
    <span className="tiny muted">{reasons[r.reason]??r.reason}</span>
    <span className="tiny muted" data-user-content>{r.detail}</span></li>)}</ol>
  {!sendRun.results.length&&<div className="empty">Ни одного письма в очереди.</div>}</>}

 {modal==='recipients'&&(()=>{const people=state.contacts.filter(p=>p.campaignId===selected);
  return <>{research&&<div className="info-banner compact"><Info size={20}/><div>
   <b>{research.mode==='organisations'?'Поиск по реальным организациям':research.mode==='search'?'Поиск в интернете':'Предложения модели без поиска'}</b>
   <p>Добавлено: {research.added} · Повторов пропущено: {research.skipped} · Подтверждено источником: {research.verified}</p>
   {research.notes?.map((n:string,i:number)=><p key={i} data-user-content className="tiny">{n}</p>)}</div></div>}
  {!people.length?<div className="empty">Адресатов пока нет. Запустите поиск или импортируйте JSON.</div>
   :<div className="recipient-list">{people.map(p=><article className="recipient" key={p.id}>
    <div className="recipient-head"><b data-user-content>{p.name}</b>
     <span className={'badge '+(p.verification==='unverified'?'draft':'active')}>{p.verification==='unverified'?'Не подтверждён':'Подтверждён'}</span></div>
    <small data-user-content>{[p.role,p.company,p.country].filter(Boolean).join(' · ')}</small>
    <p data-user-content>{p.email||'Адрес не подтверждён'}</p>
    <p className="tiny" data-user-content>{p.reason}</p>
    {p.source&&<a href={p.source} target="_blank" rel="noreferrer">Источник <ExternalLink size={12}/></a>}
    {p.verification==='unverified'&&<button className="secondary small-button" onClick={()=>{setSelected(p.id);setModal('confirm');}}>Подтвердить адресата</button>}
   </article>)}</div>}</>;})()}

 {modal==='confirm'&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const contactId=selected;
   run(async()=>{const p=await api('/contacts/confirm',{contactId,email:f.get('email'),source:f.get('source'),evidence:f.get('evidence')});
    setSelected(p.campaignId);setModal('recipients');},'Адресат подтверждён');}}>
  <p className="muted">Подтверждение требует настоящего адреса, ссылки на источник и доказательства. До него правила запрещают отправку.</p>
  <label>Адрес<input name="email" type="email" required placeholder="name@company.com"/></label>
  <label>Источник<input name="source" type="url" required placeholder="https://company.com/contact"/></label>
  <label>Доказательство<textarea name="evidence" rows={3} required placeholder="Где именно проверен адрес"/></label>
  <button disabled={busy}>Подтвердить адресата</button></form>}

 {modal==='contacts'&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{const raw=String(f.get('contacts'));const contacts=JSON.parse(raw);const result=await api(`/campaigns/${selected}/contacts`,{contacts});setNotice(`Добавлено адресатов: ${result.added}`);setModal('campaign');});}}><p className="muted">Вставьте JSON-массив. Для каждого адресата обязательны источник, основание и конкретная причина контакта.</p><label>Адресаты (JSON)<textarea name="contacts" rows={12} required placeholder={'[\n  {\n    "email": "name@company.com",\n    "name": "Имя",\n    "company": "Компания",\n    "source": "https://company.com/contact",\n    "basis": "Подтверждённое согласие",\n    "reason": "Проверяемая причина обращения"\n  }\n]'}/></label><button disabled={busy}>Импортировать адресатов</button></form>}

 {modal==='preview'&&<><p className="muted">Черновики на основе введённых фактов. Перед отправкой нужна редактура и проверка правил.</p>
  {!preview.length?<div className="empty">Сначала найдите или импортируйте адресатов.</div>:preview.map(m=><article className={m.bulk?'preview-message flagged':'preview-message'} key={m.id}>
   <div className="preview-head"><h3 data-user-content>{m.email||m.name}</h3>
    <span className={'badge '+(m.policy.decision==='allow'?'active':'draft')}>{reasons[m.policy.reason]??m.policy.reason}</span></div>
   {m.bulk&&<div className="alert error" role="alert">Похоже на спам: у адресата нет конкретной причины контакта, поэтому письмо получилось общим.</div>}
   <b data-user-content>{m.subject}</b><p className="letter" data-user-content>{m.text}</p>
   <p className="tiny"><b>Причина контакта:</b> <span data-user-content>{m.reason||'не указана'}</span></p>
   {m.source&&<a href={m.source} target="_blank" rel="noreferrer">Источник контакта <ExternalLink size={12}/></a>}
   <p className="tiny muted">Решение правил {m.policy.version} · {m.verification==='unverified'?'источник не подтверждён':'источник подтверждён'}</p>
  </article>)}
  {preview.length>0&&<p className="tiny muted">Писем в предпросмотре: {preview.length}. Отправка отключена.</p>}
  <button className="secondary" onClick={()=>setModal('campaign')}>Вернуться к кампании</button></>}

 </section></div>}
 </div>,locale)}</LocaleContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
