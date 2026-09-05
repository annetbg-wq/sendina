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
const blockers:Record<string,string>={EMERGENCY_STOP:'Аварийная остановка',NO_MAILBOX:'Нет ящиков',NOT_CONNECTED:'Ящик не подключён',TEST_SEND_REQUIRED:'Нужна тестовая отправка',TEST_SEND_FAILED:'Тестовая отправка не прошла',DNS_NOT_CHECKED:'DNS не проверялся',SPF_MISSING:'Нет записи SPF',DKIM_MISSING:'Нет записи DKIM',DMARC_MISSING:'Нет записи DMARC'};
const reasons:Record<string,string>={CHECKS_PASSED:'Разрешено правилами',EMERGENCY_STOP:'Аварийная остановка',CAMPAIGN_PAUSED:'Кампания не активна',GLOBAL_SUPPRESSION:'Адресат исключён',REPLY_RECEIVED:'Ответ уже получен',DUPLICATE_RECIPIENT:'Повтор адреса в другой кампании',LEGAL_BASIS_REQUIRED:'Нет правового основания',CONTACT_REASON_REQUIRED:'Нет причины контакта — похоже на спам',SOURCE_UNVERIFIED:'Источник не подтверждён',DOMAIN_UNVERIFIED:'Домен не проверен',DOMAIN_LIMIT:'Исчерпан лимит домена'};
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
 {page==='Главная'&&<><section className="hero-grid"><article className="hero blue"><div className="hero-art"><Target size={60} strokeWidth={1.7}/><span className="spark s1">✦</span><span className="spark s2">✦</span></div><div><span className="eyebrow">ОТ ЦЕЛИ К РЕЗУЛЬТАТУ</span><h2>У меня уже есть цель</h2><p>Найдите клиентов, партнёров или инвесторов.<br/>Запустите рассылку под вашу задачу.</p><button onClick={()=>create()}>Запустить рассылку<ArrowRight size={17}/></button></div></article><article className="hero green"><div className="hero-art"><Search size={61} strokeWidth={1.8}/><span className="spark s1">✦</span><span className="spark s2">✦</span></div><div><span className="eyebrow">ОТ ВОЗМОЖНОСТИ К ПРИБЫЛИ</span><h2>Найти, что выгодно продавать</h2><p>Изучите перспективные идеи и рынки.<br/>Проверьте спрос небольшими рассылками.</p><button className="green-button" onClick={()=>go('Возможности')}>Найти возможности<ArrowRight size={17}/></button></div></article></section>
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
   {m.testSend.status!=='none'&&<p className={'tiny '+(m.testSend.status==='ok'?'green-text':'')} data-user-content>{m.testSend.detail}</p>}
   {mr.blockers.length>0&&<ul className="blockers">{mr.blockers.map(b=><li key={b}>{blockers[b]??b}</li>)}</ul>}
   <div className="mailbox-actions">
    <button className="secondary small-button" disabled={busy||m.connection==='none'}
     onClick={()=>run(async()=>{const r=await api('/mailboxes/test',{email:m.email});
      setNotice(r.testSend.status==='ok'?'Тестовая отправка выполнена':'Тестовая отправка не прошла');})}>Тестовая отправка</button>
    {m.connection==='none'
     ?<button className="secondary small-button" onClick={()=>{setDetection(null);setModal('connect');}}>Подключить</button>
     :<button className="text-link" disabled={busy} onClick={()=>run(()=>api('/mailboxes/disconnect',{email:m.email}),'Ящик отключён')}>Отключить</button>}
   </div></div>;})}</div>
  <div className="card-footer domain-foot">
   <button className="secondary" disabled={busy} onClick={()=>{setSelected(d.id);setModal('dns');}}><RefreshCw size={14}/>Проверить DNS</button>
   <span className="tiny muted">{d.dns?.checkedAt?`SPF ${d.dns.spf?'есть':'нет'} · DKIM ${d.dns.dkim?'есть':'нет'} · DMARC ${d.dns.dmarc?'есть':'нет'}`:'DNS не проверялся'}</span>
  </div></section>;})}</div></>}

 {page==='Аккаунты'&&<><div className="info-banner"><ShieldCheck size={24}/><div><b>Кто может входить в Sendina</b>
   <p>Новый адрес получает доступ только после подтверждения. Рабочие области аккаунтов разделены: кампании и адресаты других аккаунтов отсюда не видны.</p></div>
   <button className="secondary" disabled={busy} onClick={()=>run(async()=>setAccounts(await api('/accounts')))}><RefreshCw size={14}/>Обновить</button></div>
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

 {page==='Ответы'&&<><div className="tabs">{[['all','Все ответы'],['positive','Положительные'],['neutral','Уточнения'],['negative','Отказы']].map(([key,label])=><button className={replyFilter===key?'tab active-tab':'tab'} key={key} onClick={()=>setReplyFilter(key)}>{label}</button>)}</div><div className="reply-list">{state.replies.filter(r=>(replyFilter==='all'||r.category===replyFilter)&&match(r.name+r.text+r.email)).map(r=><article className="card reply" key={r.id}><div className="reply-avatar" aria-hidden="true">{translate(r.name,locale)[0]}</div><div className="reply-content"><div className="reply-heading"><h3>{r.name} <span>{r.company}</span></h3><span className={'badge '+(r.category==='positive'?'active':'draft')}>{categories[r.category]}</span></div><small>{r.email} · {state.campaigns.find(c=>c.id===r.campaignId)?.name}</small><p data-user-content={!r.id.match(/^r[12]$/)}>{r.text}</p><div className="reply-actions"><span><CalendarDays size={14}/> {r.category==='positive'?'Следующий шаг: согласовать встречу':'Следующий шаг: изучить запрос'}</span><button className="text-link" onClick={()=>run(()=>api('/suppress',{email:r.email}),'Адресат исключён из всех кампаний')}>Исключить адресата</button></div></div></article>)}{!state.replies.filter(r=>(replyFilter==='all'||r.category===replyFilter)&&match(r.name+r.text+r.email)).length&&<div className="empty card">Ответов в этой категории пока нет.</div>}</div></>}
 {page==='Аналитика'&&<><div className="stats analytics-stats">{[['Отправлено',total],['Положительные ответы',positive],['Конверсия',`${total?(positive/total*100).toFixed(1):0}%`],['Ценность / 1 000 отправок',total?`${Math.round(value/total*1000)} $`:'—']].map(([label,n])=><article className="card metric" key={label}><span>{label}</span><h2>{n}</h2><small>Демонстрационные данные</small></article>)}</div><section className="card full-card">{header(ChartNoAxesColumnIncreasing,'Результаты по кампаниям')}{campaignTable()}<div className="card-note">Основная метрика ТЗ считается по безопасно доставленным письмам. Подтверждённых доставок пока нет; выше показан пример расчёта по отправкам.</div></section><section className="card full-card">{header(ChartNoAxesCombined,'Положительные ответы')}<div className="chart">{state.campaigns.map(c=><div key={c.id}><span>{c.name}</span><div className="chart-track"><i style={{width:Math.max(1,c.positive/Math.max(1,...state.campaigns.map(c=>c.positive))*100)+'%'}}/></div><b>{c.positive}</b></div>)}</div></section></>}
 {page==='Настройки'&&<div className="settings-grid"><section className="card setting">{header(Globe,'Сервер приложения')}<p>{browserDemo()?'Данные сохраняются только в этом браузере. Для общей рабочей области подключите сервер.':'Подключение к серверной рабочей области.'}</p><form onSubmit={e=>{e.preventDefault();run(async()=>{const url=serverDraft.trim().replace(/\/$/,'');if(url&&new URL(url).protocol!=='https:')throw Error('Укажите HTTPS-адрес сервера.');localStorage.setItem('sendina-api-url',url);await reload();},'Адрес сервера сохранён');}}><input aria-label="HTTPS-адрес сервера" type="url" placeholder="https://api.example.com" value={serverDraft} onChange={e=>setServerDraft(e.target.value)}/><button disabled={busy}>Сохранить</button></form><label className="backend-token">Токен доступа<input type="password" aria-label="Токен доступа" defaultValue={sessionStorage.getItem('token')??''} onChange={e=>sessionStorage.setItem('token',e.target.value)}/></label></section><section className="card setting">{header(Globe,'Язык интерфейса')}<p>Текст и данные пользователя сохраняются на исходном языке.</p><select aria-label="Язык интерфейса" value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="ru">Русский</option><option value="en">Английский</option></select></section><section className="card setting">{header(Search,'Подключения аккаунта')}
  <p>Ключи модели, поиска и почтовых провайдеров хранятся в вашем аккаунте. Заполните их по шагам — сервер их не возвращает обратно.</p>
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
 {modal&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal('');}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="close icon-button" aria-label="Закрыть" onClick={()=>setModal('')}><X/></button><h2 id="modal-title">{({connections:'Подключения аккаунта',connect:'Подключение ящика',recipients:'Адресаты кампании',confirm:'Подтверждение адресата',mcp:'Коннектор ChatGPT',create:'Новая рассылка',domain:'Подключить почтовый ящик',dns:'Проверка DNS',audit:'Журнал действий',idea:'Обоснование гипотезы',campaign:'Управление кампанией',contacts:'Импорт адресатов',preview:'Предпросмотр писем'} as Record<string,string>)[modal]}</h2>{error&&<div className="alert error" role="alert">{error}</div>}
 {modal==='mcp'&&integration&&<><p>Добавьте коннектор с этим адресом в ChatGPT. На экране согласия введите код коннектора — он привязывает чат ровно к вашему аккаунту.</p><div className="integration-details"><label>URL<input readOnly value={integration.mcp.endpoint}/></label>
  <label>Код коннектора<input readOnly type={connector?'text':'password'} value={connector||'••••••••'} onFocus={e=>e.currentTarget.select()}/></label>
  <div className="button-stack"><button className="secondary small-button" disabled={busy} onClick={()=>run(async()=>setConnector((await api('/settings/connector')).code))}>Показать код</button>
   <button className="text-link" disabled={busy} onClick={()=>run(async()=>setConnector((await api('/settings/connector',{})).code),'Код коннектора заменён')}>Создать новый</button></div><p>Авторизация: <b>{integration.mcp.authentication}</b></p><p>Streamable HTTP · {integration.mcp.tools.length} tools</p><label>Инструменты</label><ul>{integration.mcp.tools.map((tool:string)=><li key={tool}><code>{tool}</code></li>)}</ul></div><a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" target="_blank" rel="noreferrer">Инструкция подключения ↗</a></>}
 {modal==='create'&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{await api('/campaigns',Object.fromEntries(f));setModal('');go('Рассылки');},'Кампания создана. Добавьте адресатов для предпросмотра.');}}><p className="muted">Задайте контекст и измеримое целевое событие.</p><label>Название кампании<input name="name" autoFocus required minLength={3} maxLength={150} defaultValue={state.opportunities.find(o=>o.id===selected)?.name??''} placeholder="Например, продажи решения для отелей"/></label><div className="form-row"><label>Цель<select name="goal">{['Продажа услуги','Продажа продукта','Партнёрство','Поиск инвесторов','Найм','Закупки','Обращение','Другое'].map(v=><option key={v}>{v}</option>)}</select></label><label>Рынок<select name="market" defaultValue={state.opportunities.find(o=>o.id===selected)?.market??'США'}>{markets.map(v=><option key={v}>{v}</option>)}</select></label></div><label>Продукт и контекст<textarea name="context" required minLength={10} maxLength={5000} rows={4} defaultValue={state.opportunities.find(o=>o.id===selected)?.offer??''} placeholder="Что вы предлагаете и какую задачу решаете? Используйте только проверяемые факты."/></label><label>Целевое событие<select name="event">{['Встреча','Положительный ответ','Квалифицированный интерес','Получение документа','Покупка','Пересмотр решения'].map(v=><option key={v}>{v}</option>)}</select></label><div className="info-banner compact"><ShieldCheck size={18}/>Кампания создаётся как черновик. Отправка отключена.</div><button className="wide" disabled={busy}>Создать кампанию<ArrowRight size={16}/></button></form>}
 {modal==='domain'&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);run(async()=>{await api('/domains',{email:f.get('email')});setModal('');},'Ящик добавлен. Необходима проверка домена.');}}><p className="muted">Ящики одного домена используют общий лимит. Пароль от почты здесь не требуется.</p><label>Адрес почтового ящика<input autoFocus name="email" type="email" placeholder="you@company.com" required/></label><button className="wide" disabled={busy}>Добавить ящик</button></form>}
 {modal==='connections'&&(()=>{
  const steps=[
   {key:'openai',title:'Модель',lead:'Ключ OpenAI используется для подбора адресатов и подготовки писем. Без него эти действия откажутся работать, а не начнут выдумывать.',
    done:caps?.connections?.openai?.configured,
    fields:[['openaiKey','Ключ OpenAI','password','sk-…'],['openaiModel','Модель','text','gpt-4.1-mini'],['aiGatewayUrl','Адрес шлюза (необязательно)','text','https://api.openai.com/v1']]},
   {key:'search',title:'Поиск адресатов',lead:'С поисковым ключом кандидаты ссылаются на настоящий результат. Без него они остаются неподтверждёнными и не проходят правила.',
    done:caps?.connections?.search?.configured,
    fields:[['searchProvider','Провайдер','select',''],['searchKey','Ключ поискового API','password','']]},
   {key:'google',title:'Google Workspace',lead:'Создайте OAuth-приложение в Google Cloud Console со scope gmail.send и укажите адрес возврата ниже.',
    done:caps?.connections?.google?.configured,
    fields:[['google.clientId','Client ID','text',''],['google.clientSecret','Client secret','password','']]},
   {key:'microsoft',title:'Microsoft 365',lead:'Создайте приложение в Entra ID со scope Mail.Send и offline_access, затем укажите адрес возврата ниже.',
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
 {modal==='connect'&&(!detection
  ?<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
    run(async()=>setDetection(await api('/mailboxes/detect',{email:f.get('email')})));}}>
   <p className="muted">Введите адрес корпоративного ящика. Провайдер определяется по MX-записям домена — это ещё не подключение.</p>
   <label>Адрес ящика<input name="email" type="email" required autoFocus placeholder="name@company.com"/></label>
   <button disabled={busy}>Определить провайдера</button></form>
  :<><div className="info-banner compact"><Info size={20}/><div>
    <b>{providers[detection.provider]??providers.unknown}</b>
    <p data-user-content>{detection.note}</p>
    {detection.mx?.length>0&&<p className="tiny" data-user-content>MX: {detection.mx.slice(0,3).join(', ')}</p>}</div></div>
   {detection.personal&&<div className="alert error" role="alert">Личный ящик. Рабочий сценарий — корпоративный домен организации; личный подходит только как тестовый случай.</div>}
   {detection.route==='oauth'&&<div className="button-stack">
    <button disabled={busy} onClick={()=>run(async()=>{const r=await api('/mailboxes/oauth',{email:detection.email});
     window.open(r.url,'_blank','noopener');setModal('');setDetection(null);},'Завершите согласие в открывшейся вкладке, затем выполните тестовую отправку')}>
     Подключить через {providers[detection.provider]}</button>
    <button className="secondary" onClick={()=>setDetection({...detection,route:'smtp'})}>Вместо этого SMTP</button></div>}
   {detection.route==='smtp'&&<div className="button-stack manual-choice">
    <span className="tiny muted">Если домен закрыт почтовым шлюзом, укажите провайдера вручную:</span>
    {(['google','microsoft'] as const).map(id=><button key={id} className="secondary small-button" disabled={busy}
     onClick={()=>run(async()=>{const r=await api('/mailboxes/oauth',{email:detection.email,provider:id});
      window.open(r.url,'_blank','noopener');setModal('');setDetection(null);},'Завершите согласие в открывшейся вкладке, затем выполните тестовую отправку')}>
     {providers[id]}</button>)}</div>}
   {detection.route==='oauth-unconfigured'&&<div className="alert error" role="alert">
    OAuth для этого провайдера не настроен на сервере. Задайте client id и secret в переменных окружения либо подключите ящик по SMTP.</div>}
   {(detection.route==='smtp'||detection.route==='oauth-unconfigured')&&
    <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
     run(async()=>{await api('/mailboxes/smtp',{email:detection.email,host:f.get('host'),port:Number(f.get('port')),
      user:f.get('user'),pass:f.get('pass')});setModal('');setDetection(null);},'Ящик подключён. Выполните тестовую отправку.');}}>
     <p className="muted">Пароль хранится на сервере отдельно от рабочей области и не возвращается в интерфейс.</p>
     <div className="form-row"><label>Сервер SMTP<input name="host" required placeholder="smtp.company.com"/></label>
      <label>Порт<input name="port" type="number" required defaultValue={587}/></label></div>
     <label>Пользователь<input name="user" required defaultValue={detection.email}/></label>
     <label>Пароль<input name="pass" type="password" required/></label>
     <button disabled={busy}>Проверить и подключить</button></form>}
   <button className="text-link" onClick={()=>setDetection(null)}>Другой адрес</button></>)}
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
