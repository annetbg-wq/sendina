import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {ChartNoAxesCombined,House,Send,Lightbulb,Globe,Mail,MessageCircle,ChartNoAxesColumnIncreasing,Settings,Search,Bell,ChevronDown,ArrowRight,ChevronRight,ShieldCheck,Target,Trophy,Star,Check,Plus,Pause,Play,X,Users,CalendarDays,Handshake,ArrowUpRight,ArrowDownRight,Shield,Power,ExternalLink,Info,RefreshCw,Menu} from 'lucide-react';
import type {State} from '../server/seed';
import './styles.css';
import {localize, translate, type Locale} from './i18n';
import {api,backendUrl,browserDemo,captureSession,session,setSession} from './api';
import {Flag,markets} from './flag';
import {mailboxReadiness,domainReadiness} from '../server/readiness';
const navigation=[['Главная',House],['Рассылки',Send],['Возможности',Lightbulb],['Рынки',Globe],['Домены и почты',Mail],['Ответы',MessageCircle],['Аналитика',ChartNoAxesColumnIncreasing],['Настройки',Settings]] as const;
const providers:Record<string,string>={google:'Google Workspace',microsoft:'Microsoft 365',smtp:'SMTP',unknown:'Провайдер не определён'};
const connections:Record<string,string>={none:'не подключён',oauth:'подключён по OAuth',smtp:'подключён по SMTP'};
const blockers:Record<string,string>={EMERGENCY_STOP:'Аварийная остановка',NO_MAILBOX:'Нет ящиков',NOT_CONNECTED:'Ящик не подключён',
 AUTH_REQUIRED:'Нужна проверка входа',AUTH_FAILED:'Вход не принят',
 TEST_SEND_REQUIRED:'Нужна тестовая отправка',TEST_SEND_FAILED:'Тестовая отправка не прошла',
 INCOMING_CHANNEL_REQUIRED:'Нужна проверка приёма',INCOMING_CHANNEL_FAILED:'Приём почты недоступен',
 INCOMING_MESSAGE_REQUIRED:'Тестовое письмо ещё не прочитано',INCOMING_MESSAGE_FAILED:'Тестовое письмо не пришло',
 DNS_NOT_CHECKED:'DNS не проверялся',SPF_MISSING:'Нет записи SPF',DKIM_MISSING:'Нет записи DKIM',DMARC_MISSING:'Нет записи DMARC'};
const checkLabels:[string,string][]=[['auth','Вход'],['testSend','Отправка'],['imap','Приём'],['incoming','Чтение письма']];
const reasons:Record<string,string>={CHECKS_PASSED:'Разрешено правилами',EMERGENCY_STOP:'Аварийная остановка',CAMPAIGN_PAUSED:'Кампания не активна',GLOBAL_SUPPRESSION:'Адресат исключён',REPLY_RECEIVED:'Ответ уже получен',DUPLICATE_RECIPIENT:'Повтор адреса в другой кампании',LEGAL_BASIS_REQUIRED:'Нет правового основания',CONTACT_REASON_REQUIRED:'Нет причины контакта — похоже на спам',SOURCE_UNVERIFIED:'Источник не подтверждён',FIRST_BATCH_APPROVAL_REQUIRED:'Нужно подтверждение первой партии',MANUAL_APPROVAL_REQUIRED:'Отправка только вручную',DOMAIN_UNVERIFIED:'Домен не проверен',DOMAIN_LIMIT:'Исчерпан лимит домена'};
const categories:Record<string,string>={positive:'Положительный',neutral:'Уточнение',objection:'Возражение',referral:'Переадресация',later:'Позже',unsubscribe:'Отписка',negative:'Отказ',automatic:'Автоответ',bounce:'Недоставка'};

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
 const [guided,setGuided]=useState<any>(null);
 useEffect(()=>{localStorage.setItem('sendina-locale',locale);document.documentElement.lang=locale;document.title=locale==='ru'?'Sendina — Монетизатор':'Sendina — Monetizer';},[locale]);
 const [state,setState]=useState<State|null>(null),[page,setPage]=useState('Главная'),[query,setQuery]=useState(''),[modal,setModal]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[selected,setSelected]=useState(''),[preview,setPreview]=useState<any[]>([]),[replyFilter,setReplyFilter]=useState('all'),[menu,setMenu]=useState(false);
 const reload=async()=>{setState(await api('/state'));api('/capabilities').then(c=>{setCaps(c);setAccount(c.account??null);}).catch(()=>setCaps(null));};
 useEffect(()=>{let active=true;const load=async()=>{for(let attempt=0;attempt<4;attempt++){try{await reload();return;}catch(e:any){if(e.status===401)return;if(attempt===3){if(active)setError(e.message);return;}await new Promise(r=>setTimeout(r,750));}}};void load();return()=>{active=false;};},[]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(t);},[notice]);
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==='Escape')setModal('');};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
 const run=async(fn:()=>Promise<unknown>,message?:string)=>{setBusy(true);setError('');try{await fn();await reload();if(message)setNotice(message);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 const go=(p:string)=>{setPage(p);setQuery('');setMenu(false);};
 const menuItems=account?.role==='superadmin'?[...navigation,['Аккаунты',Users] as const]:navigation;
 const [accounts,setAccounts]=useState<any[]>([]);
 const [platform,setPlatform]=useState<any>(null);
 const [step,setStep]=useState(0);
 const create=(idea?:State['opportunities'][number])=>{setSelected(idea?.id??'');setModal('create');};
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
 const campaigns=state.campaigns.filter(c=>match(c.name+' '+c.market)),ideas=state.opportunities.filter(o=>match(o.name+' '+o.market));
 const total=state.campaigns.reduce((a,c)=>a+c.sent,0),positive=state.campaigns.reduce((a,c)=>a+c.positive,0),value=state.campaigns.reduce((a,c)=>a+c.value,0);
 const link=(label:string,target:string)=><button className="text-link" onClick={()=>go(target)}>{label}<ArrowRight size={14}/></button>;
 const header=(Icon:any,title:string,action?:React.ReactNode)=><div className="card-heading"><h3><Icon size={18}/>{title}</h3>{action}</div>;
 const campaignTable=(compact=false)=><div className="table-scroll"><table><thead><tr><th>Цель</th><th>Рынок</th><th>Состояние</th><th>Результат</th>{!compact&&<th/>}</tr></thead><tbody>{campaigns.map(c=><tr key={c.id}><td><button className="row-link" onClick={()=>{setSelected(c.id);setModal('campaign');}} data-user-content={!c.id.match(/^c[123]$/)}>{c.name}</button>{!compact&&<small>{c.event}</small>}</td><td><Flag market={c.market}/>{c.market}</td><td><span className={'badge '+c.status}>{c.status==='active'?'Активна':c.status==='paused'?'На паузе':'Черновик'}</span></td><td>{c.positive} ответов <span className="muted">· {c.sent?(c.positive/c.sent*100).toFixed(1):'0'}%</span></td>{!compact&&<td><button className="icon-button" disabled={busy} aria-label={c.status==='active'?'Приостановить':'Активировать'} onClick={()=>run(()=>api(`/campaigns/${c.id}/status`,{status:c.status==='active'?'paused':'active'}),'Статус кампании обновлён')}>{c.status==='active'?<Pause size={16}/>:<Play size={16}/>}</button></td>}</tr>)}</tbody></table>{!campaigns.length&&<div className="empty">Кампании не найдены. Создайте первую рассылку.</div>}</div>;
 const opportunityTable=()=> <div className="table-scroll"><table><thead><tr><th>Место</th><th>Идея / возможность</th><th>Рынок</th><th>Оценка</th><th>Тренд</th></tr></thead><tbody>{ideas.slice(0,4).map((o,i)=><tr key={o.id}><td>{i+1}</td><td><button className="row-link" onClick={()=>{setSelected(o.id);setModal('idea');}}>{o.name}</button></td><td><Flag market={o.market}/><span className="country">{o.market}</span></td><td><b className={i===0?'green-text':''}>{o.score}<span className="muted"> /100</span></b></td><td><span className={o.trend>0?'trend up':o.trend<0?'trend down':'trend'}>{o.trend>0?<ArrowUpRight size={13}/>:o.trend<0?<ArrowDownRight size={13}/>:<ArrowRight size={13}/>} {o.trend>0?'Растёт':o.trend<0?'Падает':'Стабильно'}</span></td></tr>)}</tbody></table></div>;
 const domainTable=()=> <div className="table-scroll"><table><thead><tr><th>Домен / почтовые ящики</th><th>Проверка</th><th>Объём примера</th></tr></thead><tbody>{state.domains.filter(d=>match(d.name)).map(d=><tr key={d.id}><td><b data-user-content>{d.name}</b>{d.mailboxes.map(m=><small key={m.email} data-user-content>{m.email}</small>)}</td><td>{(()=>{const r=domainReadiness(d,state.stopped);return <span className={'badge '+(r.ready?'active':'draft')}>{r.ready?'Готов':blockers[r.blockers[0]]??'Не готов'}</span>;})()}</td><td><div className="volume">{d.used} / {d.limit}<div className="bar"><i style={{width:`${d.limit?Math.min(100,d.used/d.limit*100):0}%`}}/></div></div></td></tr>)}</tbody></table></div>;
 return localize(<div className="app"><aside className={menu?'sidebar open':'sidebar'}><a className="brand" href="#" onClick={e=>{e.preventDefault();go('Главная');}}><ChartNoAxesCombined size={29}/><span>Монетизатор<span className="brand-sub">by sendina</span></span></a><nav>{menuItems.map(([label,Icon])=><button key={label} aria-label={label} aria-current={page===label?'page':undefined} className={page===label?'nav-item selected':'nav-item'} onClick={()=>go(label)}><Icon size={20}/>{label}{label==='Ответы'&&<span className="nav-count">{state.replies.length}</span>}</button>)}</nav><div className="safety"><Shield size={20}/><strong>Безопасная отправка</strong><p>Контролируйте объём отправок и репутацию ваших доменов на каждом этапе.</p>{link('Подробнее','Домены и почты')}<div className="safety-foot"><span className="dot"/> Защита включена</div></div><div className="workspace"><div className="avatar small" aria-hidden="true">{(account?.email??'A')[0].toUpperCase()}</div>
 <div>{account?.email?<b data-user-content>{account.email}</b>:<b>Моя рабочая область</b>}
  <small>{account?.role==='superadmin'?'Суперадмин':browserDemo()?'Демонстрационный режим':'Рабочая область аккаунта'}</small></div>
 {account&&<button className="icon-button" aria-label="Выйти" onClick={()=>{void api('/auth/logout').catch(()=>{});setSession('');location.reload();}}><Power size={15}/></button>}</div></aside>
 <div className="main-shell"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Открыть меню" onClick={()=>setMenu(!menu)}><Menu/></button><label className="search"><Search size={17}/><input aria-label="Поиск" placeholder="Поиск по рабочей области" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌕</kbd></label><div className="top-actions"><button className="locale-switch" aria-label="Язык интерфейса" onClick={()=>setLocale(locale==='ru'?'en':'ru')}><Globe size={14}/>{locale.toUpperCase()}</button><span className={'system '+(state.stopped?'halted':'')}><span className="status-icon">{state.stopped?<Pause size={11}/>:<Check size={11}/>}</span>{state.stopped?'Отправки остановлены':'Демо · отправка отключена'}</span><button className="icon-button notification" aria-label="Журнал уведомлений" onClick={()=>setModal('audit')}><Bell size={20}/><i/></button><button className="profile" onClick={()=>go('Настройки')}><span className="avatar">A</span><ChevronDown size={14}/></button></div></header>
 <main><div className="breadcrumb">Рабочая область <ChevronRight size={12}/> <span>{page}</span></div><div className="page-title"><div><h1>{page==='Главная'?'Что вы хотите получить сегодня?':page}</h1><p>{page==='Главная'?'От первой идеи до измеримого результата — в одной системе.':({Рассылки:'Ваши цели, эксперименты и результаты в одном месте.',Возможности:'Экономические гипотезы для первых небольших тестов.',Рынки:'Сравнивайте страны и выбирайте рынок для следующего запуска.','Домены и почты':'Репутация отправителя — основа устойчивого результата.',Ответы:'Все диалоги и следующие действия вашей команды.',Аналитика:'Оптимизируйте результат, а не количество отправок.',Настройки:'Управление рабочей областью, исключениями и автоматизацией.'} as Record<string,string>)[page]}</p></div>{page==='Главная'?<span className="date">{new Date().toLocaleDateString(locale==='ru'?'ru-RU':'en-US',{day:'numeric',month:'long',year:'numeric'})} <ChevronDown size={13}/></span>:page==='Рассылки'?<button onClick={()=>create()}><Plus size={16}/>Создать рассылку</button>:null}</div>
 {browserDemo()&&<div className="demo-banner"><Info size={14}/>Демо в браузере · данные хранятся на этом устройстве<button className="text-link" onClick={()=>go('Настройки')}>Подключить сервер<ArrowRight size={12}/></button></div>}{error&&<div className="alert error" role="alert">{error}<button className="icon-button" onClick={()=>setError('')} aria-label="Закрыть ошибку"><X size={16}/></button></div>}
 {page==='Главная'&&<><section className="scenario-grid">
 <article className="scenario recommended"><span className="scenario-tag">Рекомендуем</span>
  <div className="scenario-art blue"><Target size={30} strokeWidth={1.8}/></div>
  <h2>Сделать всё за меня</h2>
  <p>Опишите продукт и цель. Sendina сама найдёт компании и адресатов, проверит источники и подготовит персональные письма.</p>
  <p className="scenario-need">От вас: описание продукта и подтверждение первой партии.</p>
  <button onClick={()=>{setGuided({step:'brief',mode:'auto'});setModal('guided');}}>Начать<ArrowRight size={15}/></button></article>
 <article className="scenario">
  <div className="scenario-art green"><Users size={30} strokeWidth={1.8}/></div>
  <h2>У меня уже есть адресаты</h2>
  <p>Загрузите свои контакты. Поиск компаний пропускается, всё остальное — проверка, письма, правила, ответы — работает так же.</p>
  <p className="scenario-need">От вас: список адресатов с источником и причиной обращения.</p>
  <button className="secondary" onClick={()=>{setGuided({step:'brief',mode:'contacts'});setModal('guided');}}>Загрузить контакты<ArrowRight size={15}/></button></article>
 <article className="scenario">
  <div className="scenario-art amber"><Settings size={30} strokeWidth={1.8}/></div>
  <h2>Настроить вручную</h2>
  <p>Полный контроль: источники, подключение почты, правила отправки, адресаты и письма по отдельности.</p>
  <p className="scenario-need">От вас: настройка каждого шага самостоятельно.</p>
  <button className="secondary" onClick={()=>go('Рассылки')}>Открыть рассылки<ArrowRight size={15}/></button></article>
</section>
<section className="stats"><article className="stat"><div className="stat-icon blue-icon"><ShieldCheck/></div><div><span>Доступно для отправки</span><h2>0 <small>писем</small></h2><p>Подключите и проверьте домен</p></div></article><article className="stat"><div className="stat-icon green-icon"><MessageCircle/></div><div><span>Положительные ответы</span><h2>{positive}</h2><p className="green-text">Из демонстрационных кампаний</p></div></article><article className="stat"><div className="stat-icon purple-icon"><Globe/></div><div><span>Лучший рынок в примере</span><h2 className="text-value"><Flag market="США"/>США</h2><p>24 ответа · конверсия 6,1%</p></div></article><article className="stat"><div className="stat-icon amber-icon"><Star/></div><div><span>Лучшая гипотеза</span><h2 className="text-value">Отели и гостиницы</h2><p>Оценка: <b>92/100</b> · пример</p></div></article></section>
 <div className="dashboard-grid"><div className="column"><section className="card next-action">{header(Target,'Следующее лучшее действие',<span className="ai-label">РЕКОМЕНДАЦИЯ</span>)}<div className="next-body"><ol><li>Создать тест для продукта «Бутик-гостиница»</li><li>Подключить и проверить домен отправителя</li><li>Добавить адресатов с источниками контактов</li><li>Проверить первые персональные письма</li></ol><button className="small-button" onClick={()=>create(state.opportunities[0])}>Применить<ArrowRight size={14}/></button></div><div className="card-note"><Info size={12}/> Первый тест поможет проверить гипотезу без масштабной рассылки</div></section><section className="card">{header(Send,'Активные запуски',<span className="subtle-tag">{state.campaigns.filter(c=>c.status==='active').length} активны</span>)}{campaignTable(true)}<div className="card-footer">{link('Перейти ко всем рассылкам','Рассылки')}</div></section><section className="card">{header(ChartNoAxesCombined,'Результат',<span className="muted tiny">Данные примера</span>)}<div className="funnel">{[[Send,'Отправлено',total,'100%'],[MessageCircle,'Положительных',positive,total?(positive/total*100).toFixed(1)+'%':'0%'],[Users,'Квалифицировано','—','нет данных'],[CalendarDays,'Встречи','—','нет данных'],[Handshake,'Сделки','—','нет данных']].map(([Icon,label,n,percent]:any,i)=><React.Fragment key={label}>{i>0&&<span className="funnel-arrow">→</span>}<div><span>{label}</span><div className={'funnel-icon color-'+i}><Icon size={21}/></div><b>{n.toLocaleString(locale==='ru'?'ru-RU':'en-US')}</b><small>{percent}</small></div></React.Fragment>)}</div><div className="card-footer">{link('Смотреть аналитику воронки','Аналитика')}</div></section></div><div className="column"><section className="card ranking">{header(Trophy,'Рейтинг возможностей',link('Все возможности','Возможности'))}{opportunityTable()}<div className="card-footer">{link('Исследовать гипотезы','Возможности')}</div></section><section className="card">{header(Mail,'Домены и почты',link('Управление','Домены и почты'))}{domainTable()}<div className="card-footer">{link('Подключить почтовый ящик','Домены и почты')}</div></section><section className="card">{header(MessageCircle,'Причины ответов',link('Все ответы','Ответы'))}<div className="reasons">{[['Интерес к идее',44,'#159753'],['Нужны подробности',31,'#2863e8'],['Есть возражения',17,'#e7a520'],['Не сейчас',8,'#a0a6b3']].map(([label,n,color],i)=><div key={label}><span className="muted">{i+1}</span><span>{label}</span><div className="bar"><i style={{width:n+'%',background:String(color)}}/></div><b>{n}%</b></div>)}</div><div className="card-note">Иллюстрация распределения категорий</div></section></div></div></>}
 {page==='Рассылки'&&<section className="card full-card">{header(Send,'Все кампании',<span className="subtle-tag">{campaigns.length}</span>)}{campaignTable()}</section>}
 {page==='Возможности'&&<><div className="info-banner"><Lightbulb size={20}/><div><b>Пять гипотез для первого теста</b><p>Это демонстрационные идеи. Оценки не подтверждены исследованием рынка или реальными рассылками.</p></div></div><div className="ideas-grid">{ideas.map((o,i)=><article className="card idea-card" key={o.id}><div className="idea-top"><span className="idea-number">0{i+1}</span><span className="score">{o.score}<small>/100</small></span></div><h2>{o.name}</h2><p className="market-label"><Flag market={o.market}/>{o.market} <span>от ${o.price.toLocaleString(locale==='ru'?'ru-RU':'en-US')}</span></p><label>ГИПОТЕЗА БОЛИ</label><p>{o.pain}</p><label>ПРЕДЛОЖЕНИЕ</label><p>{o.offer}</p><div className="idea-bottom"><button className="secondary" onClick={()=>{setSelected(o.id);setModal('idea');}}>Обоснование</button><button onClick={()=>create(o)}>Создать тест<ArrowRight size={15}/></button></div></article>)}</div></>}
 {page==='Рынки'&&<section className="card full-card">{header(Globe,'Рейтинг рынков',<span className="subtle-tag">Демонстрационная оценка</span>)}<table><thead><tr><th>Рынок</th><th>Перспективная ниша</th><th>Оценка</th><th>Первый тест</th></tr></thead><tbody>{ideas.map(o=><tr key={o.id}><td className="market-name"><Flag market={o.market}/>{o.market}</td><td>{o.name}<small>{o.pain}</small></td><td><span className="score">{o.score}</span></td><td><button className="secondary" onClick={()=>create(o)}>Подготовить тест <ArrowRight size={14}/></button></td></tr>)}</tbody></table><div className="card-note">Оценки — примеры. Источники, правовые ограничения и доступность адресатов требуют отдельного исследования.</div></section>}
 {page==='Домены и почты'&&<>
 <div className="info-banner"><ShieldCheck size={24}/><div><b>Ящик готов только после тестовой отправки</b>
  <p>Проверка DNS показывает записи домена, но подключением не считается. Статус «готов» появляется после подключения провайдера, успешной тестовой отправки и выполнения правил.</p></div>
  <button onClick={()=>{setDetection(null);setModal('connect');}}><Plus size={16}/>Подключить ящик</button></div>
 <div className="ideas-grid">{state.domains.map(d=>{const dr=domainReadiness(d,state.stopped);return <section className="card" key={d.id}>
  <div className="card-heading"><h3><Shield size={18}/><span data-user-content>{d.name}</span></h3>
   <span className={'badge '+(dr.ready?'active':'draft')}>{dr.ready?'Готов к отправке':'Не готов'}</span></div>
  <div className="mailbox-list">{d.mailboxes.map(m=>{const mr=mailboxReadiness(d,m,state.stopped);return <div className="mailbox" key={m.email}>
   <div className="mailbox-head"><b data-user-content>{m.email}</b>
    <span className={'badge '+(mr.ready?'active':'draft')}>{mr.ready?'Готов':'Не готов'}</span></div>
   <small>{providers[m.provider]??providers.unknown} · {connections[m.connection]}</small>
   {m.transport&&<p className="tiny muted" data-user-content>{m.transport.label} · SMTP {m.transport.smtp.host}:{m.transport.smtp.port} · IMAP {m.transport.imap.host}:{m.transport.imap.port}</p>}
   {m.connection!=='none'&&<div className="check-row">{checkLabels.map(([key,label])=>{
     const value=(m as any)[key]?.status??'none';
     return <span key={key} className={'check '+value} title={(m as any)[key]?.detail||''}>
      {value==='ok'?<Check size={11}/>:value==='failed'?<X size={11}/>:<span className="check-dot"/>}{label}</span>;})}</div>}
   {mr.blockers.length>0&&<ul className="blockers">{mr.blockers.map(b=><li key={b}>{blockers[b]??b}</li>)}</ul>}
   <div className="mailbox-actions">
    {m.connection==='none'
     ?<button className="secondary small-button" onClick={()=>{setDetection(null);setAdvanced(false);setModal('connect');}}>Подключить</button>
     :<><button className="secondary small-button" disabled={busy}
        onClick={()=>run(async()=>{const r=await api('/mailboxes/verify',{email:m.email});
         setNotice(r.ready?'Ящик проверен и готов':'Проверка: '+Object.entries(r.checks??{}).map(([k,v]:any)=>k+' '+v.status).join(', '));})}>Проверить ящик</button>
       <button className="secondary small-button" disabled={busy}
        onClick={()=>run(async()=>{const r=await api('/mailboxes/sync',{email:m.email});
         setNotice(`Принято ответов: ${r.added}, без совпадения: ${r.unmatched}`);})}>Принять ответы</button>
       <button className="text-link" disabled={busy} onClick={()=>run(()=>api('/mailboxes/disconnect',{email:m.email}),'Ящик отключён')}>Отключить</button></>}
   </div></div>;})}</div>
  <div className="card-footer domain-foot">
   <button className="secondary" disabled={busy} onClick={()=>{setSelected(d.id);setModal('dns');}}><RefreshCw size={14}/>Проверить DNS</button>
   <span className="tiny muted">{d.dns?.checkedAt?`SPF ${d.dns.spf?'есть':'нет'} · DKIM ${d.dns.dkim?'есть':'нет'} · DMARC ${d.dns.dmarc?'есть':'нет'}`:'DNS не проверялся'}</span>
  </div></section>;})}</div></>}

 {page==='Аккаунты'&&<><div className="info-banner"><ShieldCheck size={24}/><div><b>Кто может входить в Sendina</b>
   <p>Новый адрес получает доступ только после подтверждения. Рабочие области аккаунтов разделены: кампании и адресаты других аккаунтов отсюда не видны.</p></div>
   <button className="secondary" disabled={busy} onClick={()=>run(async()=>{setAccounts(await api('/accounts'));setPlatform(await api('/platform'));})}><RefreshCw size={14}/>Обновить</button></div>
  <section className="card full-card">{header(Shield,'Приложения платформы',
    <span className="subtle-tag">{platform?.google?.configured||platform?.microsoft?.configured?'Настроено':'Не настроено'}</span>)}
   <div className="padded"><p className="muted">Это настройка администратора, а не пользователя. Заполните её один раз — и все аккаунты будут подключать Google и Microsoft одной кнопкой, без ввода client id.</p>
    <p className="tiny muted">Адрес возврата для обоих провайдеров: <code>{(backendUrl()||location.origin)+'/oauth/mailbox/callback'}</code></p>
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
     <p className="tiny muted">Заполненное здесь работает для всех аккаунтов, и обычному пользователю не придётся вводить ни одного ключа.</p>
     <div className="form-row"><label>Ключ модели<input name="openaiKey" type="password" placeholder={platform?.openai?.configured?'Заполнено':''}/></label>
      <label>Модель<input name="openaiModel" defaultValue={platform?.openai?.model??''}/></label></div>
     <div className="form-row"><label>Поиск в интернете<select name="searchProvider" defaultValue={platform?.search?.provider??''}>
       <option value="">Не подключён</option><option value="brave">Brave</option><option value="tavily">Tavily</option><option value="serper">Serper</option></select></label>
      <label>Ключ поиска<input name="searchKey" type="password" placeholder={platform?.search?.configured?'Заполнено':''}/></label></div>
     <div className="form-row"><label>Поиск организаций<select name="placesProvider" defaultValue={platform?.places?.provider??''}>
       <option value="">Не подключён</option><option value="google">Google Places</option></select></label>
      <label>Ключ поиска организаций<input name="placesKey" type="password" placeholder={platform?.places?.configured?'Заполнено':''}/></label></div>
     <button disabled={busy}>Сохранить настройки платформы</button></form></div></section>
  {!accounts.length?<div className="empty">Нажмите «Обновить», чтобы загрузить список аккаунтов.</div>
   :<section className="card full-card">{header(Users,'Аккаунты',<span className="subtle-tag">{accounts.length}</span>)}
    <div className="table-scroll"><table><thead><tr><th>Адрес</th><th>Роль</th><th>Состояние</th><th>Вход</th><th/></tr></thead>
     <tbody>{accounts.map(a=><tr key={a.id}>
      <td><b data-user-content>{a.email}</b></td>
      <td>{a.role==='superadmin'?'Суперадмин':'Пользователь'}</td>
      <td><span className={'badge '+(a.status==='approved'?'active':a.status==='blocked'?'paused':'draft')}>
       {a.status==='approved'?'Подтверждён':a.status==='blocked'?'Заблокирован':'Ожидает подтверждения'}</span></td>
      <td className="tiny muted">{a.lastLoginAt?new Date(a.lastLoginAt).toLocaleDateString(locale==='ru'?'ru-RU':'en-US'):'ни разу'}</td>
      <td><div className="row-actions">
       {a.status!=='approved'&&<button className="secondary small-button" disabled={busy}
        onClick={()=>run(async()=>{await api('/accounts/decide',{id:a.id,status:'approved'});setAccounts(await api('/accounts'));},'Доступ подтверждён')}>Подтвердить</button>}
       {a.status!=='blocked'&&a.role!=='superadmin'&&<button className="text-link" disabled={busy}
        onClick={()=>run(async()=>{await api('/accounts/decide',{id:a.id,status:'blocked'});setAccounts(await api('/accounts'));},'Доступ закрыт')}>Заблокировать</button>}
      </div></td></tr>)}</tbody></table></div></section>}</>}

 {page==='Ответы'&&<><div className="tabs">{[['all','Все ответы'],['positive','Положительные'],['neutral','Уточнения'],['negative','Отказы']].map(([key,label])=><button className={replyFilter===key?'tab active-tab':'tab'} key={key} onClick={()=>setReplyFilter(key)}>{label}</button>)}</div><div className="reply-list">{state.replies.filter(r=>(replyFilter==='all'||r.category===replyFilter)&&match(r.name+r.text+r.email)).map(r=><article className="card reply" key={r.id}><div className="reply-avatar" aria-hidden="true">{translate(r.name,locale)[0]}</div><div className="reply-content"><div className="reply-heading"><h3>{r.name} <span>{r.company}</span></h3><span className={'badge '+(r.category==='positive'?'active':'draft')}>{categories[r.category]}</span></div><small>{r.email} · {state.campaigns.find(c=>c.id===r.campaignId)?.name}{(r as any).source==='inbox'&&<> · принято из почтового ящика</>}</small><p data-user-content={!r.id.match(/^r[12]$/)}>{r.text}</p><div className="reply-actions"><span><CalendarDays size={14}/> {r.category==='positive'?'Следующий шаг: согласовать встречу':'Следующий шаг: изучить запрос'}</span><button className="text-link" onClick={()=>run(()=>api('/suppress',{email:r.email}),'Адресат исключён из всех кампаний')}>Исключить адресата</button></div></div></article>)}{!state.replies.filter(r=>(replyFilter==='all'||r.category===replyFilter)&&match(r.name+r.text+r.email)).length&&<div className="empty card">Ответов в этой категории пока нет.</div>}</div></>}
 {page==='Аналитика'&&<><div className="stats analytics-stats">{[['Отправлено',total],['Положительные ответы',positive],['Конверсия',`${total?(positive/total*100).toFixed(1):0}%`],['Ценность / 1 000 отправок',total?`${Math.round(value/total*1000)} $`:'—']].map(([label,n])=><article className="card metric" key={label}><span>{label}</span><h2>{n}</h2><small>Демонстрационные данные</small></article>)}</div><section className="card full-card">{header(ChartNoAxesColumnIncreasing,'Результаты по кампаниям')}{campaignTable()}<div className="card-note">Основная метрика ТЗ считается по безопасно доставленным письмам. Подтверждённых доставок пока нет; выше показан пример расчёта по отправкам.</div></section><section className="card full-card">{header(ChartNoAxesCombined,'Положительные ответы')}<div className="chart">{state.campaigns.map(c=><div key={c.id}><span>{c.name}</span><div className="chart-track"><i style={{width:Math.max(1,c.positive/Math.max(1,...state.campaigns.map(c=>c.positive))*100)+'%'}}/></div><b>{c.positive}</b></div>)}</div></section></>}
 {page==='Настройки'&&<div className="settings-grid"><section className="card setting">{header(Globe,'Сервер приложения')}<p>{browserDemo()?'Данные сохраняются только в этом браузере. Для общей рабочей области подключите сервер.':'Подключение к серверной рабочей области.'}</p><form onSubmit={e=>{e.preventDefault();run(async()=>{const url=serverDraft.trim().replace(/\/$/,'');if(url&&new URL(url).protocol!=='https:')throw Error('Укажите HTTPS-адрес сервера.');localStorage.setItem('sendina-api-url',url);await reload();},'Адрес сервера сохранён');}}><input aria-label="HTTPS-адрес сервера" type="url" placeholder="https://api.example.com" value={serverDraft} onChange={e=>setServerDraft(e.target.value)}/><button disabled={busy}>Сохранить</button></form><label className="backend-token">Токен доступа<input type="password" aria-label="Токен доступа" defaultValue={sessionStorage.getItem('token')??''} onChange={e=>sessionStorage.setItem('token',e.target.value)}/></label></section><section className="card setting">{header(Globe,'Язык интерфейса')}<p>Текст и данные пользователя сохраняются на исходном языке.</p><select aria-label="Язык интерфейса" value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="ru">Русский</option><option value="en">Английский</option></select></section><section className="card setting">{header(Search,'Подключения аккаунта')}
  <p>{caps?.provided?.model==='platform'?'Модель и поиск уже предоставлены Sendina — заполнять ничего не нужно. Эти поля пригодятся, только если вы хотите работать на своих ключах.':'Ключи модели и поиска пока не настроены администратором. Их можно указать здесь, для своего аккаунта.'}</p>
  <div className="connection-status">
   {[['Модель',caps?.connections?.openai?.configured],['Поиск адресатов',caps?.connections?.search?.configured],
     ['Google Workspace',caps?.connections?.google?.configured],['Microsoft 365',caps?.connections?.microsoft?.configured]].map(([label,ok])=>
    <span key={String(label)} className={'badge '+(ok?'active':'draft')}>{label as string}</span>)}</div>
  <div className="button-stack">
   <button onClick={()=>{setStep(0);setModal('connections');}}>Заполнить по шагам<ArrowRight size={15}/></button>
   <select aria-label="Режим поиска адресатов" value={state.settings?.recipientMode??'auto'} disabled={busy}
    onChange={e=>run(()=>api('/settings/recipients',{mode:e.target.value}),'Режим сохранён')}>
    <option value="auto">Автоматически</option><option value="search">Поиск в интернете</option><option value="proposal">Предложения модели</option></select></div>
  {caps&&!caps.storage?.postgres&&<p className="tiny muted">Хранилище: файл контейнера. Подключите PostgreSQL, иначе данные пропадут при передеплое.</p>}
 </section>
 <section className="card setting">{header(MessageCircle,'Коннектор ChatGPT')}<p>Управляйте Sendina из чата: создавайте кампании, готовьте письма и смотрите результаты через MCP.</p><button className="secondary" onClick={()=>run(async()=>{setIntegration(await api('/integrations'));setModal('mcp');})}>Параметры подключения<ArrowRight size={15}/></button></section><section className="card setting">{header(Power,'Управление отправками')}<p>Аварийная остановка приостанавливает все активные кампании. После снятия остановки возобновляйте их по отдельности.</p><button className={state.stopped?'secondary':'danger'} disabled={busy} onClick={()=>run(()=>api('/stop',{stopped:!state.stopped}),state.stopped?'Остановка снята. Кампании остаются на паузе.':'Все кампании приостановлены')}><Power size={16}/>{state.stopped?'Снять аварийную остановку':'Остановить все кампании'}</button></section><section className="card setting">{header(Shield,'Глобальные исключения')}<p>Отказавшиеся адресаты исключаются из всех кампаний рабочей области.</p><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(()=>api('/suppress',{email:f.get('email')}),'Адресат исключён');e.currentTarget.reset();}}><input type="email" name="email" placeholder="email@company.com" aria-label="Исключить email" required/><button disabled={busy}>Добавить</button></form><div className="suppressed">{state.suppressed.map(e=><span key={e}>{e}</span>)}</div></section><section className="card setting">{header(Info,'Режим работы')}<p>Поиск адресатов и подготовка писем работают через подключённую модель. SMTP и автоматический приём писем ещё не подключены, отправка отключена.</p><span className="badge draft">Демонстрационный режим</span></section><section className="card setting">{header(CalendarDays,'Журнал действий')}<p>Создание кампаний, проверки и изменения состояния сохраняются с датой и идентификатором.</p><button className="secondary" onClick={()=>setModal('audit')}>Открыть журнал<ArrowRight size={15}/></button></section></div>}
 <footer className="page-footer"><span><span className="dot"/> Sendina · ваш путь от идеи к результату</span><span>Демо-данные · v0.1</span></footer></main></div>
 {notice&&<div className="toast" role="status"><Check size={18}/>{notice}<button className="icon-button" aria-label="Закрыть уведомление" onClick={()=>setNotice('')}><X size={15}/></button></div>}
 {modal&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal('');}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="close icon-button" aria-label="Закрыть" onClick={()=>setModal('')}><X/></button><h2 id="modal-title">{({guided:'Запуск кампании',connections:'Подключения аккаунта',connect:'Подключение ящика',recipients:'Адресаты кампании',confirm:'Подтверждение адресата',mcp:'Коннектор ChatGPT',create:'Новая рассылка',domain:'Подключить почтовый ящик',dns:'Проверка DNS',audit:'Журнал действий',idea:'Обоснование гипотезы',campaign:'Управление кампанией',contacts:'Импорт адресатов',preview:'Предпросмотр писем'} as Record<string,string>)[modal]}</h2>{error&&<div className="alert error" role="alert">{error}</div>}
 {modal==='mcp'&&integration&&<><p>Добавьте коннектор с этим адресом в ChatGPT. На экране согласия введите код коннектора — он привязывает чат ровно к вашему аккаунту.</p><div className="integration-details"><label>URL<input readOnly value={integration.mcp.endpoint}/></label>
  <label>Код коннектора<input readOnly type={connector?'text':'password'} value={connector||'••••••••'} onFocus={e=>e.currentTarget.select()}/></label>
  <div className="button-stack"><button className="secondary small-button" disabled={busy} onClick={()=>run(async()=>setConnector((await api('/settings/connector')).code))}>Показать код</button>
   <button className="text-link" disabled={busy} onClick={()=>run(async()=>setConnector((await api('/settings/connector',{})).code),'Код коннектора заменён')}>Создать новый</button></div><p>Авторизация: <b>{integration.mcp.authentication}</b></p><p>Streamable HTTP · {integration.mcp.tools.length} tools</p><label>Инструменты</label><ul>{integration.mcp.tools.map((tool:string)=><li key={tool}><code>{tool}</code></li>)}</ul></div><a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" target="_blank" rel="noreferrer">Инструкция подключения ↗</a></>}
 {modal==='create'&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{await api('/campaigns',Object.fromEntries(f));setModal('');go('Рассылки');},'Кампания создана. Добавьте адресатов для предпросмотра.');}}><p className="muted">Задайте контекст и измеримое целевое событие.</p><label>Название кампании<input name="name" autoFocus required minLength={3} maxLength={150} defaultValue={state.opportunities.find(o=>o.id===selected)?.name??''} placeholder="Например, продажи решения для отелей"/></label><div className="form-row"><label>Цель<select name="goal">{['Продажа услуги','Продажа продукта','Партнёрство','Поиск инвесторов','Найм','Закупки','Обращение','Другое'].map(v=><option key={v}>{v}</option>)}</select></label><label>Рынок<select name="market" defaultValue={state.opportunities.find(o=>o.id===selected)?.market??'США'}>{markets.map(v=><option key={v}>{v}</option>)}</select></label></div><label>Продукт и контекст<textarea name="context" required minLength={10} maxLength={5000} rows={4} defaultValue={state.opportunities.find(o=>o.id===selected)?.offer??''} placeholder="Что вы предлагаете и какую задачу решаете? Используйте только проверяемые факты."/></label><label>Целевое событие<select name="event">{['Встреча','Положительный ответ','Квалифицированный интерес','Получение документа','Покупка','Пересмотр решения'].map(v=><option key={v}>{v}</option>)}</select></label><div className="info-banner compact"><ShieldCheck size={18}/>Кампания создаётся как черновик. Отправка отключена.</div><button className="wide" disabled={busy}>Создать кампанию<ArrowRight size={16}/></button></form>}
 {modal==='domain'&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{await api('/domains',{email:f.get('email')});setModal('');},'Ящик добавлен. Необходима проверка домена.');}}><p className="muted">Ящики одного домена используют общий лимит. Пароль от почты здесь не требуется.</p><label>Адрес почтового ящика<input autoFocus name="email" type="email" placeholder="you@company.com" required/></label><button className="wide" disabled={busy}>Добавить ящик</button></form>}
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
  const sender=state.domains.some(d=>domainReadiness(d,state.stopped).ready);
  if(guided.step==='brief')return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
    const product=String(f.get('product')),problem=String(f.get('problem'));
    run(async()=>{
     let market=String(f.get('market'));
     let why='';
     if(market==='recommend'){const r=await api('/recommend-market',{context:product+'. '+problem,goal:String(f.get('goal'))});market=r.market;why=r.why;}
     const campaign=await api('/campaigns',{name:product.slice(0,140),market,goal:String(f.get('goal')),
      context:product+'. Решаемая проблема: '+problem,event:String(f.get('event')),control:'confirm'});
     setGuided({...guided,step:guided.mode==='auto'?'research':'contacts',campaignId:campaign.id,market,why});});}}>
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
   <label>Где ищем<select name="market" defaultValue="recommend">
    <option value="recommend">Пусть Sendina порекомендует</option>
    {markets.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
   <button disabled={busy}>Продолжить<ArrowRight size={15}/></button></form>;

  if(guided.step==='research')return <>
   {guided.why&&<div className="info-banner compact"><Info size={20}/><div><b>Рынок: {guided.market}</b><p data-user-content>{guided.why}</p></div></div>}
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

  const preview=guided.preview;
  return <>
   {guided.found&&<div className="info-banner compact"><Info size={20}/><div>
     <b>{guided.found.mode==='organisations'?'Поиск по реальным организациям':guided.found.mode==='search'?'Поиск в интернете':'Предложения модели'}</b>
     <p>Добавлено: {guided.found.added} · Подтверждено источником: {guided.found.verified}</p>
     {guided.found.notes?.map((n:string,i:number)=><p key={i} className="tiny" data-user-content>{n}</p>)}</div></div>}
   <p className="muted">Адресатов: {preview?.recipients??0}, из них подтверждено источником: {preview?.verified??0}. Ниже — первые письма целиком.</p>
   {!preview?.sample?.length?<div className="empty">Подходящих адресатов пока нет.</div>
    :preview.sample.map((m:any)=><article className={m.bulk?'preview-message flagged':'preview-message'} key={m.contactId}>
     <div className="preview-head"><h3 data-user-content>{m.name}{m.role&&<> · {m.role}</>}</h3>
      <span className={'badge '+(m.policy.decision==='allow'?'active':'draft')}>{reasons[m.policy.reason]??m.policy.reason}</span></div>
     <p className="tiny" data-user-content>{[m.company,m.country].filter(Boolean).join(' · ')} · {m.email||'адрес не подтверждён'}</p>
     <p className="tiny"><b>Почему выбран:</b> <span data-user-content>{m.reason}</span></p>
     {m.evidence&&<p className="tiny"><b>Доказательство:</b> <span data-user-content>{m.evidence}</span></p>}
     {m.source&&<a href={m.source} target="_blank" rel="noreferrer">Источник <ExternalLink size={12}/></a>}
     <p className="letter" data-user-content>{m.text}</p></article>)}
   <label>Как запускаем<select value={preview?.campaign?.control??'confirm'} disabled={busy}
     onChange={e=>run(async()=>{await api('/campaigns/'+guided.campaignId+'/control',{control:e.target.value});
      setGuided({...guided,preview:await api('/campaigns/'+guided.campaignId+'/launch-preview',{limit:5})});})}>
    <option value="confirm">Подтвердить первую партию</option>
    <option value="auto">Полностью автоматически</option>
    <option value="manual">Полностью вручную</option></select></label>
   {!sender&&<div className="alert error" role="alert">Отправитель не подключён. Правила не пропустят отправку, пока ящик не подключён и не проверен.
    <button className="text-link" onClick={()=>{setDetection(null);setModal('connect');}}>Подключить отправителя<ArrowRight size={12}/></button></div>}
   <div className="button-stack">
    <button disabled={busy} onClick={()=>run(async()=>{
      if((preview?.campaign?.control??'confirm')==='confirm')await api('/campaigns/'+guided.campaignId+'/approve',{});
      await api('/campaigns/'+guided.campaignId+'/status',{status:'active'});
      setModal('');setGuided(null);go('Рассылки');},'Кампания запущена. Отправка пойдёт в рамках правил.')}>
     Подтвердить и запустить</button>
    <button className="secondary" onClick={()=>{setModal('');setGuided(null);go('Рассылки');}}>Оставить черновиком</button></div></>;
 })()}
 {modal==='connect'&&(!detection
  ?<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
    run(async()=>setDetection(await api('/mailboxes/detect',{email:f.get('email')})));}}>
   <p className="muted">Введите адрес корпоративного ящика. Остальное Sendina определит сама по домену: это ещё не подключение.</p>
   <label>Адрес ящика<input name="email" type="email" required autoFocus placeholder="name@company.com"/></label>
   <button disabled={busy}>Продолжить</button></form>
  :<><div className="info-banner compact"><Info size={20}/><div>
    <b>{providers[detection.provider]??providers.unknown}</b>
    <p data-user-content>{detection.note}</p>
    {detection.mx?.length>0&&<p className="tiny" data-user-content>MX: {detection.mx.slice(0,3).join(', ')}</p>}</div></div>
   {detection.personal&&<div className="alert error" role="alert">Личный ящик. Рабочий сценарий — корпоративный домен организации; личный подходит только как тестовый случай.</div>}

   {detection.route==='oauth'&&<div className="button-stack">
    <button disabled={busy} onClick={()=>run(async()=>{const r=await api('/mailboxes/oauth',{email:detection.email});
     window.open(r.url,'_blank','noopener');setModal('');setDetection(null);},'Завершите согласие в открывшейся вкладке, затем проверьте ящик')}>
     Подключить {providers[detection.provider]}</button>
    <span className="tiny muted">{detection.appOwner==='platform'?'Приложение Sendina — client id вводить не нужно.':'Используется приложение вашего аккаунта.'}</span></div>}

   {detection.route==='oauth-unconfigured'&&<div className="alert error" role="alert">
    Приложение {providers[detection.provider]} ещё не настроено. Это делает администратор Sendina один раз на всю платформу; до этого ящик можно подключить как обычный корпоративный.</div>}

   {(detection.route==='auto'||detection.route==='manual'||detection.route==='oauth-unconfigured')&&(()=>{
     const found=detection.settings;
     const smtp=found?.smtp??{host:'',port:465,secure:true};
     const imap=found?.imap??{host:'',port:993,secure:true};
     const manual=advanced||!found;
     return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
       const asServer=(prefix:string)=>({host:String(f.get(prefix+'Host')),port:Number(f.get(prefix+'Port')),secure:f.get(prefix+'Secure')==='on'});
       run(async()=>{const r=await api('/mailboxes/connect',{email:detection.email,
         smtp:asServer('smtp'),imap:asServer('imap'),user:String(f.get('user')||detection.email),
         pass:f.get('pass'),source:found?.source??'manual',label:found?.label??'Указано вручную'});
        setModal('');setDetection(null);setAdvanced(false);
        setNotice(r.ready?'Ящик подключён и проверен':'Ящик подключён. Проверка: '+Object.entries(r.checks??{}).map(([k,v]:any)=>k+' '+v.status).join(', '));});}}>
      {found&&!advanced
       ?<div className="info-banner compact"><Check size={18}/><div><b>Настройки определены автоматически</b>
          <p className="tiny" data-user-content>{found.label}</p>
          <button type="button" className="text-link" onClick={()=>setAdvanced(true)}>Показать и изменить вручную</button></div></div>
       :<><p className="muted">Автоматически определить настройки не удалось. Их можно взять в панели вашего почтового провайдера.</p>
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
   <button className="text-link" onClick={()=>{setDetection(null);setAdvanced(false);}}>Другой адрес</button></>)}
 {modal==='dns'&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{const c=await api(`/domains/${selected}/check`,{selector:f.get('selector')});setNotice(`SPF: ${c.spf?'найден':'не найден'} · DKIM: ${c.dkim?'найден':'не найден'} · DMARC: ${c.dmarc?'найден':'не найден'}`);setModal('');});}}><p>Домен: <b>{state.domains.find(d=>d.id===selected)?.name}</b></p><label>DKIM selector<input name="selector" defaultValue="default" pattern="[a-zA-Z0-9_-]{1,63}" required/></label><p className="muted">Уточните selector у почтового провайдера. Наличие записей не подтверждает возможность отправки.</p><button disabled={busy}>Проверить DNS</button></form>}
 {modal==='audit'&&<div className="audit-list">{state.audit.map(a=><div key={a.id}><span className="audit-dot"/><div><p>{a.action}</p><small>{new Date(a.at).toLocaleString(locale==='ru'?'ru-RU':'en-US')}</small></div></div>)}</div>}
 {modal==='idea'&&(()=>{const o=state.opportunities.find(o=>o.id===selected)!;return <><span className="badge draft">Демонстрационная гипотеза</span><h3>{o.name} · <Flag market={o.market}/>{o.market}</h3><p>{o.pain}. Предлагаемое решение: {translate(o.offer,locale).toLowerCase()}.</p><div className="info-banner compact"><Info size={20}/>Оценка {o.score}/100 и уверенность {o.confidence}% — иллюстрация. Источники исследования отсутствуют.</div><p>Первый тест: подготовить 20 проверенных адресатов, изучить основания контакта и оценить положительные ответы.</p><button onClick={()=>create(o)}>Подготовить кампанию<ArrowRight size={16}/></button></>;})()}
 {modal==='campaign'&&(()=>{const c=state.campaigns.find(c=>c.id===selected)!;
  const people=state.contacts.filter(p=>p.campaignId===c.id);
  const unconfirmed=people.filter(p=>p.verification==='unverified').length;
  const others=new Set(state.contacts.filter(p=>p.campaignId!==c.id).map(p=>p.email).filter(Boolean));
  const repeated=people.filter(p=>p.email&&others.has(p.email)).length;
  return <><h3 data-user-content={!c.id.match(/^c[123]$/)}>{c.name}</h3><p data-user-content={!c.id.match(/^c[123]$/)}>{c.context}</p>
  <p className="muted"><Flag market={c.market}/>{c.market} · Целевое событие: {c.event}</p>
  <div className="info-banner compact"><Info size={20}/><div>Адресатов: {people.length} · Писем: {state.messages.filter(m=>m.campaignId===c.id).length}{unconfirmed>0&&<> · Не подтверждено: {unconfirmed}</>}</div></div>
  {repeated>0&&<div className="alert error" role="alert">Повторяющихся адресов из других кампаний: {repeated}. Правила заблокируют их при подготовке писем.</div>}
  <div className="button-stack">
   <button disabled={busy} onClick={()=>run(async()=>{const r=await api(`/campaigns/${c.id}/find`,{count:20});setResearch(r);setModal('recipients');},'Поиск адресатов завершён')}><Search size={16}/>Найти адресатов</button>
   <button disabled={busy} onClick={()=>run(async()=>{setPreview(await api(`/campaigns/${c.id}/preview`,{limit:10}));setModal('preview');})}><Send size={16}/>Подготовить письма</button>
   <button className="secondary" onClick={()=>{setResearch(null);setModal('recipients');}}><Users size={16}/>Адресаты · {people.length}</button>
   <button className="secondary" onClick={()=>setModal('contacts')}>Импорт JSON</button>
  </div></>;})()}
 {modal==='recipients'&&(()=>{const people=state.contacts.filter(p=>p.campaignId===selected);
  return <>{research&&<div className="info-banner compact"><Info size={20}/><div>
   <b>{research.mode==='search'?'Поиск в интернете':'Предложения модели без поиска'}</b>
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
 </div>,locale);
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
