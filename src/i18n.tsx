import React from 'react';
import {countries,regions} from '../server/geo';
export type Locale='ru'|'en';
const pairs=`Сервер приложения|Application server
Данные сохраняются только в этом браузере. Для общей рабочей области подключите сервер.|Data is saved only in this browser. Connect a server for a shared workspace.
Подключение к серверной рабочей области.|Connected to the server workspace.
Укажите HTTPS-адрес сервера.|Enter an HTTPS server URL.
Адрес сервера сохранён|Server URL saved
HTTPS-адрес сервера|HTTPS server URL
Сохранить|Save
Подключить сервер|Connect server
Демо в браузере · данные хранятся на этом устройстве|Browser demo · data is stored on this device
Для проверки DNS подключите сервер в настройках.|Connect a server in Settings to check DNS.
Для этого действия подключите сервер в настройках.|Connect a server in Settings for this action.
Сервер недоступен. Проверьте адрес подключения.|Server unavailable. Check the connection URL.
Монетизатор|Monetizer
Главная|Overview
Рассылки|Campaigns
Возможности|Opportunities
Рынки|Markets
Домены и почты|Domains & mailboxes
Ответы|Replies
Аналитика|Analytics
Настройки|Settings
Рабочая область|Workspace
Моя рабочая область|My workspace
Что вы хотите получить сегодня?|What would you like to achieve today?
От первой идеи до измеримого результата — в одной системе.|From your first idea to measurable results — all in one place.
Ваши цели, эксперименты и результаты в одном месте.|Your goals, experiments and results in one place.
Экономические гипотезы для первых небольших тестов.|Business hypotheses for your first small experiments.
Сравнивайте страны и выбирайте рынок для следующего запуска.|Compare countries and choose your next market.
Репутация отправителя — основа устойчивого результата.|Sender reputation is the foundation of lasting results.
Все диалоги и следующие действия вашей команды.|All conversations and your team's next steps.
Оптимизируйте результат, а не количество отправок.|Optimize outcomes, not sending volume.
Управление рабочей областью, исключениями и автоматизацией.|Manage your workspace, exclusions and automation.
Демонстрационный режим|Demo mode
Безопасная отправка|Safe sending
Контролируйте объём отправок и репутацию ваших доменов на каждом этапе.|Monitor sending volume and domain reputation at every step.
Подробнее|Learn more
Защита включена|Protection enabled
Поиск по рабочей области|Search your workspace
Открыть меню|Open menu
Журнал уведомлений|Activity notifications
Отправки остановлены|Sending stopped
Демо · отправка отключена|Demo · sending disabled
5 сентября 2026|September 5, 2026
Создать рассылку|Create campaign
Закрыть ошибку|Dismiss error
ОТ ЦЕЛИ К РЕЗУЛЬТАТУ|FROM GOAL TO RESULTS
У меня уже есть цель|I already have a goal
Найдите клиентов, партнёров или инвесторов.|Find customers, partners or investors.
Запустите рассылку под вашу задачу.|Build a campaign around your goal.
Запустить рассылку|Launch a campaign
ОТ ВОЗМОЖНОСТИ К ПРИБЫЛИ|FROM OPPORTUNITY TO REVENUE
Найти, что выгодно продавать|Find your next opportunity
Изучите перспективные идеи и рынки.|Explore promising ideas and markets.
Проверьте спрос небольшими рассылками.|Validate demand with small campaigns.
Найти возможности|Explore opportunities
Доступно для отправки|Available to send
Подключите и проверьте домен|Connect and verify a domain
Положительные ответы|Positive replies
Из демонстрационных кампаний|From demo campaigns
Лучший рынок в примере|Top sample market
США|United States
Германия|Germany
Испания|Spain
Австралия|Australia
Великобритания|United Kingdom
ОАЭ|UAE
24 ответа · конверсия 6,1%|24 replies · 6.1% conversion
Лучшая гипотеза|Top hypothesis
Отели и гостиницы|Hotels & hospitality
Оценка:|Score:
Следующее лучшее действие|Your next best action
РЕКОМЕНДАЦИЯ|RECOMMENDED
Создать тест для продукта «Бутик-гостиница»|Create a boutique hotel experiment
Подключить и проверить домен отправителя|Connect and verify your sending domain
Добавить адресатов с источниками контактов|Add recipients with documented sources
Проверить первые персональные письма|Review your first personalized messages
Применить|Apply
Первый тест поможет проверить гипотезу без масштабной рассылки|Validate your hypothesis with a small first experiment
Активные запуски|Active campaigns
Перейти ко всем рассылкам|View all campaigns
Данные примера|Sample data
Результат|Results
Отправлено|Sent
Положительных|Positive
Квалифицировано|Qualified
Встречи|Meetings
Сделки|Deals
нет данных|no data
Смотреть аналитику воронки|View funnel analytics
Рейтинг возможностей|Opportunity ranking
Все возможности|All opportunities
Исследовать гипотезы|Explore hypotheses
Управление|Manage
Подключить почтовый ящик|Connect a mailbox
Причины ответов|Reply insights
Все ответы|All replies
Интерес к идее|Interested in the idea
Нужны подробности|Needs more details
Есть возражения|Has objections
Не сейчас|Not right now
Иллюстрация распределения категорий|Sample category distribution
Все кампании|All campaigns
Цель|Goal
Рынок|Market
Состояние|Status
Активна|Active
На паузе|Paused
Черновик|Draft
Приостановить|Pause
Активировать|Activate
Кампании не найдены. Создайте первую рассылку.|No campaigns found. Create your first campaign.
Место|Rank
Идея / возможность|Idea / opportunity
Оценка|Score
Тренд|Trend
Растёт|Growing
Падает|Declining
Стабильно|Stable
Домен / почтовые ящики|Domain / mailboxes
Проверка|Verification
Объём примера|Sample volume
Не проверен|Unverified
Продажи бутик-гостиниц в Европе|Boutique hotel sales in Europe
Поиск партнёров для внедрения|Implementation partner outreach
Решение официального запроса|Official request resolution
Автоматизация работы небольшого отеля|Small hotel operations automation
Совместное внедрение решений|Joint solution implementation
Получение документов|Obtaining documents
Помощник по доходу для гостиниц|Hotel revenue assistant
Платформа для аренды на сутки|Short-term rental platform
Сервис для гостей и бронирований|Guest and booking service
Автоматизация заявок для агентств|Agency lead automation
Ручная обработка запросов гостей|Manual guest request handling
Автоматизация ответов и бронирований|Automated replies and bookings
Потери выручки при изменении спроса|Revenue lost as demand changes
Рекомендации по управлению тарифами|Pricing recommendations
Разрозненные каналы бронирования|Fragmented booking channels
Единый кабинет объектов и гостей|One workspace for properties and guests
Долгое ожидание ответа|Long response times
Многоязычный помощник для гостей|Multilingual guest assistant
Потеря входящих заявок|Lost inbound leads
Квалификация и маршрутизация обращений|Lead qualification and routing
Пять гипотез для первого теста|Five hypotheses for your first experiment
Это демонстрационные идеи. Оценки не подтверждены исследованием рынка или реальными рассылками.|These are sample ideas. Scores are not backed by market research or live campaigns.
ГИПОТЕЗА БОЛИ|PROBLEM HYPOTHESIS
ПРЕДЛОЖЕНИЕ|OFFER
Обоснование|Reasoning
Создать тест|Create experiment
Рейтинг рынков|Market ranking
Демонстрационная оценка|Sample score
Перспективная ниша|Promising niche
Первый тест|First experiment
Подготовить тест|Prepare experiment
Оценки — примеры. Источники, правовые ограничения и доступность адресатов требуют отдельного исследования.|Scores are examples. Sources, legal restrictions and recipient availability require research.
Проверка перед каждой отправкой|Checks before every send
SPF, DKIM и DMARC — только часть проверки. Отправка остаётся отключённой до подключения провайдера и правил.|SPF, DKIM and DMARC are only part of verification. Sending is disabled until a provider and policies are connected.
Добавить ящик|Add mailbox
Подключённые домены|Connected domains
ящика · общий лимит домена|mailboxes · shared domain limit
Готовность к отправке не подтверждена.|Sending readiness is not confirmed.
Проверить DNS|Check DNS
Положительные|Positive
Уточнения|Questions
Отказы|Rejections
Положительный|Positive
Уточнение|Question
Возражение|Objection
Переадресация|Referral
Позже|Later
Отписка|Unsubscribe
Отказ|Rejection
Автоответ|Auto-reply
Недоставка|Bounce
Следующий шаг: согласовать встречу|Next step: schedule a meeting
Следующий шаг: изучить запрос|Next step: review the request
Исключить адресата|Exclude recipient
Ответов в этой категории пока нет.|No replies in this category yet.
Анна Мартин|Anna Martin
Марк Уилсон|Mark Wilson
Добрый день! Интересное предложение. Можем обсудить на встрече на следующей неделе?|Hello! This sounds interesting. Could we discuss it in a meeting next week?
Спасибо. Пришлите, пожалуйста, подробности о партнёрской программе.|Thank you. Please send details about your partner program.
Конверсия|Conversion
Ценность / 1 000 отправок|Value / 1,000 sends
Демонстрационные данные|Demo data
Результаты по кампаниям|Campaign results
Основная метрика ТЗ считается по безопасно доставленным письмам. Подтверждённых доставок пока нет; выше показан пример расчёта по отправкам.|The primary metric uses safely delivered messages. No deliveries are confirmed yet; the example above uses sends.
Управление отправками|Sending controls
Аварийная остановка приостанавливает все активные кампании. После снятия остановки возобновляйте их по отдельности.|Emergency stop pauses all active campaigns. Resume campaigns individually after lifting the stop.
Снять аварийную остановку|Lift emergency stop
Остановить все кампании|Stop all campaigns
Глобальные исключения|Global exclusions
Отказавшиеся адресаты исключаются из всех кампаний рабочей области.|Recipients who decline are excluded across all workspace campaigns.
Исключить email|Exclude email
Добавить|Add
Режим работы|Operating mode
Локальная рабочая область с сохранением данных. SMTP, автоматическое исследование и приём писем ещё не подключены. Генерация предпросмотра использует введённые факты.|A persistent local workspace. SMTP, automated research and incoming email are not connected yet. Previews use the facts you provide.
Журнал действий|Activity log
Создание кампаний, проверки и изменения состояния сохраняются с датой и идентификатором.|Campaign creation, checks and status changes are logged with timestamps and identifiers.
Открыть журнал|Open activity log
Sendina · ваш путь от идеи к результату|Sendina · from idea to results
Демо-данные · v0.1|Demo data · v0.1
Закрыть уведомление|Dismiss notification
Новая рассылка|New campaign
Подключить почтовый ящик|Connect a mailbox
Проверка DNS|DNS verification
Обоснование гипотезы|Hypothesis reasoning
Управление кампанией|Campaign management
Импорт адресатов|Import recipients
Предпросмотр писем|Message preview
Закрыть|Close
Задайте контекст и измеримое целевое событие.|Provide context and a measurable target event.
Название кампании|Campaign name
Например, продажи решения для отелей|For example, hotel solution sales
Продажа услуги|Service sales
Продажа продукта|Product sales
Партнёрство|Partnership
Поиск инвесторов|Investor outreach
Найм|Recruiting
Закупки|Procurement
Обращение|Official request
Другое|Other
Продукт и контекст|Product and context
Что вы предлагаете и какую задачу решаете? Используйте только проверяемые факты.|What do you offer and which problem do you solve? Use only verifiable facts.
Целевое событие|Target event
Встреча|Meeting
Положительный ответ|Positive reply
Квалифицированный интерес|Qualified interest
Получение документа|Document received
Покупка|Purchase
Пересмотр решения|Decision review
Кампания создаётся как черновик. Отправка отключена.|The campaign will be created as a draft. Sending is disabled.
Создать кампанию|Create campaign
Ящики одного домена используют общий лимит. Пароль от почты здесь не требуется.|Mailboxes on the same domain share a limit. Your email password is not needed here.
Адрес почтового ящика|Mailbox address
Домен:|Domain:
Уточните selector у почтового провайдера. Наличие записей не подтверждает возможность отправки.|Check the selector with your email provider. DNS records alone do not confirm sending readiness.
Демонстрационная гипотеза|Sample hypothesis
Первый тест: подготовить 20 проверенных адресатов, изучить основания контакта и оценить положительные ответы.|First experiment: prepare 20 verified recipients, review contact grounds and measure positive replies.
Подготовить кампанию|Prepare campaign
Добавить адресатов|Add recipients
Вставьте JSON-массив. Для каждого адресата обязательны источник, основание и конкретная причина контакта.|Paste a JSON array. Each recipient needs a source, contact basis and specific reason for outreach.
Адресаты (JSON)|Recipients (JSON)
Импортировать адресатов|Import recipients
Черновики на основе введённых фактов. Перед отправкой нужна редактура и проверка правил.|Drafts use the facts you entered. Review the text and policies before sending.
Сначала добавьте адресатов кампании.|Add campaign recipients first.
Источник контакта|Contact source
Заблокировано:|Blocked:
Вернуться к кампании|Back to campaign
Кампания создана. Добавьте адресатов для предпросмотра.|Campaign created. Add recipients to preview messages.
Статус кампании обновлён|Campaign status updated
Адресат исключён из всех кампаний|Recipient excluded across all campaigns
Адресат исключён|Recipient excluded
Остановка снята. Кампании остаются на паузе.|Emergency stop lifted. Campaigns remain paused.
Все кампании приостановлены|All campaigns paused
Ящик добавлен. Необходима проверка домена.|Mailbox added. Domain verification is required.
Загружаем рабочую область…|Loading your workspace…
Вход в рабочую область|Sign in to your workspace
Рабочая область защищена токеном доступа. Введите токен, который задан на сервере.|This workspace is protected by an access token. Enter the token configured on the server.
Войти|Sign in
Посмотреть демонстрацию|View the demo
Токен доступа|Access token
Повторить|Retry
Ошибка запроса|Request failed
Кампания не найдена|Campaign not found
Сначала отключите аварийную остановку|Lift emergency stop first
Домен не найден|Domain not found
Требуется токен доступа|Access token required
Недопустимый источник запроса|Invalid request origin
Адресат не принадлежит кампании|Recipient does not belong to this campaign
Создана демонстрационная рабочая область. Показатели и гипотезы — примеры.|Demo workspace created. Metrics and hypotheses are examples.
Предлагаемое решение:|Suggested solution:
— иллюстрация. Источники исследования отсутствуют.|— illustrative only. No research sources are available.
и уверенность|and confidence
Адресатов:|Recipients:
Писем:|Messages:
Показаны первые 5 из|Showing the first 5 of
Добавлено адресатов:|Recipients added:
не найден|not found
найден|found
активны|active
ответов|replies
писем|messages
пример|sample
Коннектор ChatGPT|ChatGPT connector
Управляйте Sendina из чата: создавайте кампании, готовьте письма и смотрите результаты через MCP.|Manage Sendina in chat: create campaigns, prepare messages and review results through MCP.
Параметры подключения|Connection details
Загрузка…|Loading…
Авторизация|Authentication
Инструменты|Tools
Для подключения в ChatGPT нужен доступный HTTPS-адрес и настроенный OAuth-провайдер.|Connecting in ChatGPT requires a reachable HTTPS endpoint and a configured OAuth provider.
Инструкция подключения|Connection guide
Не настроено|Not configured
Язык интерфейса|Interface language
Русский|Russian
Английский|English
Поиск|Search
Текст и данные пользователя сохраняются на исходном языке.|User content stays in its original language.
Глобальное исключение:|Global exclusion:
Создана кампания|Campaign created
Кампания|Campaign
Импортировано адресатов:|Recipients imported:
Получен ответ|Reply received
Аварийная остановка всех кампаний|Emergency stop for all campaigns
Аварийная остановка снята. Кампании остаются на паузе.|Emergency stop lifted. Campaigns remain paused.
Добавлен ящик|Mailbox added
Требуется проверка DNS и почтового провайдера.|DNS and email provider verification required.
Проверка отправителя провайдером ещё требуется.|Provider verification of the sender is still required.
Оценки и гипотезы — демонстрационные.|Scores and hypotheses are illustrative.
Отправка не подключена. Требуются проверенный почтовый провайдер, версионированные правила юрисдикций и подтверждение первой партии.|Sending is not connected. A verified email provider, versioned jurisdiction policies and first-batch approval are required.
Отключено|Disabled
от $|from $
ответа|replies
нет|no
активна|active
%|%
Разрешено правилами|Allowed by policy
Аварийная остановка|Emergency stop
Кампания не активна|Campaign is not active
Адресат исключён|Recipient excluded
Ответ уже получен|Reply already received
Повтор адреса в другой кампании|Address repeated in another campaign
Нет правового основания|No legal ground
Нет причины контакта — похоже на спам|No contact reason — looks like spam
Источник не подтверждён|Source not verified
Домен не проверен|Domain not verified
Исчерпан лимит домена|Domain limit reached
Не подтверждено:|Unverified:
Повторяющихся адресов из других кампаний:|Addresses repeated from other campaigns:
Правила заблокируют их при подготовке писем.|Policy will block them when messages are prepared.
Найти адресатов|Find recipients
Подготовить письма|Prepare messages
Импорт JSON|JSON import
Поиск адресатов завершён|Recipient research finished
Адресаты кампании|Campaign recipients
Адресаты|Recipients
Подтверждение адресата|Confirm a recipient
Поиск в интернете|Web search
Предложения модели без поиска|Model proposals without search
Добавлено:|Added:
Повторов пропущено:|Duplicates skipped:
Подтверждено источником:|Confirmed by a source:
Адресатов пока нет. Запустите поиск или импортируйте JSON.|No recipients yet. Run the research or import JSON.
Не подтверждён|Unverified
Подтверждён|Verified
Адрес не подтверждён|Address not verified
Подтвердить адресата|Confirm recipient
Подтверждение требует настоящего адреса, ссылки на источник и доказательства. До него правила запрещают отправку.|Confirmation requires a real address, a source link and evidence. Until then policy blocks sending.
Где именно проверен адрес|Where the address was checked
Адресат подтверждён|Recipient confirmed
Доказательство|Evidence
Сначала найдите или импортируйте адресатов.|Find or import recipients first.
Похоже на спам: у адресата нет конкретной причины контакта, поэтому письмо получилось общим.|Looks like spam: this recipient has no specific contact reason, so the message came out generic.
Причина контакта:|Contact reason:
не указана|not given
Решение правил|Policy decision
источник не подтверждён|source not verified
источник подтверждён|source verified
Писем в предпросмотре:|Messages in preview:
Отправка отключена.|Sending is disabled.
Поиск адресатов|Recipient research
Подключён поиск в интернете: у кандидатов будет настоящая ссылка на источник.|Web search is connected: candidates will carry a real source link.
Поисковый API не подключён. Модель может предлагать кандидатов, но они остаются неподтверждёнными.|No search API connected. The model may propose candidates, but they stay unverified.
Режим поиска адресатов|Recipient research mode
Автоматически|Automatic
Предложения модели|Model proposals
Модель:|Model:
Поиск:|Search:
не подключена|not connected
не подключён|not connected
Режим сохранён|Mode saved
Хранилище: файл контейнера. Подключите PostgreSQL, иначе данные пропадут при передеплое.|Storage: a container file. Connect PostgreSQL or the data will be lost on the next deployment.
Поиск адресатов и подготовка писем работают через подключённую модель. SMTP и автоматический приём писем ещё не подключены, отправка отключена.|Recipient research and message preparation run through the connected model. SMTP and automatic reply intake are not connected yet, and sending is disabled.
Для поиска адресатов подключите сервер в настройках.|Connect a server in Settings to find recipients.
Для подтверждения адресата подключите сервер в настройках.|Connect a server in Settings to confirm a recipient.
Адрес|Address
Источник|Source
Ящик готов только после тестовой отправки|A mailbox is ready only after a test send
Проверка DNS показывает записи домена, но подключением не считается. Статус «готов» появляется после подключения провайдера, успешной тестовой отправки и выполнения правил.|A DNS check reports the domain records but never counts as a connection. Ready appears only after the provider is connected, a test send succeeds and the rules pass.
Подключить ящик|Connect a mailbox
Подключение ящика|Mailbox connection
Готов к отправке|Ready to send
Не готов|Not ready
Готов|Ready
Тестовая отправка|Test send
Подключить|Connect
Отключить|Disconnect
Проверить DNS|Check DNS
DNS не проверялся|DNS not checked
Провайдер не определён|Provider not identified
не подключён|not connected
подключён по OAuth|connected over OAuth
подключён по SMTP|connected over SMTP
Ящик не подключён|Mailbox not connected
Нужна тестовая отправка|A test send is required
Тестовая отправка не прошла|The test send failed
Нет записи SPF|No SPF record
Нет записи DKIM|No DKIM record
Нет записи DMARC|No DMARC record
Нет ящиков|No mailboxes
Введите адрес корпоративного ящика. Провайдер определяется по MX-записям домена — это ещё не подключение.|Enter a corporate mailbox address. The provider is identified from the domain MX records, which is not yet a connection.
Адрес ящика|Mailbox address
Определить провайдера|Identify the provider
Личный ящик. Рабочий сценарий — корпоративный домен организации; личный подходит только как тестовый случай.|A personal mailbox. The working scenario is an organisation domain; a personal one only suits a test case.
Подключить через|Connect with
Вместо этого SMTP|Use SMTP instead
OAuth для этого провайдера не настроен на сервере. Задайте client id и secret в переменных окружения либо подключите ящик по SMTP.|OAuth for this provider is not configured on the server. Set a client id and secret in the environment, or connect the mailbox over SMTP.
Пароль хранится на сервере отдельно от рабочей области и не возвращается в интерфейс.|The password is stored on the server apart from the workspace and never returned to the interface.
Сервер SMTP|SMTP server
Порт|Port
Пользователь|User
Пароль|Password
Проверить и подключить|Verify and connect
Другой адрес|A different address
Если домен закрыт почтовым шлюзом, укажите провайдера вручную:|If a mail gateway fronts the domain, name the provider yourself:
Завершите согласие в открывшейся вкладке, затем выполните тестовую отправку|Finish the consent in the new tab, then run a test send
Тестовая отправка выполнена|The test send succeeded
Ящик подключён. Выполните тестовую отправку.|Mailbox connected. Run a test send.
Ящик отключён|Mailbox disconnected
есть|yes
нет|no
Для подключения ящика подключите сервер в настройках.|Connect a server in Settings to connect a mailbox.
Вход в Sendina|Sign in to Sendina
Проверьте почту|Check your mail
Отправить ещё раз|Send again
Заявка принята|Request received
Администратор получит уведомление. После подтверждения придёт письмо со ссылкой для входа.|An administrator will be notified. Once approved, a login link arrives by email.
Доступ закрыт|Access closed
Ссылка в журнале сервера|The link is in the server log
Так можно войти первому суперадмину до настройки системной почты.|This lets the first superadmin sign in before platform mail is configured.
Не удалось подключиться к серверу.|Could not reach the server.
Введите рабочий адрес. Мы пришлём ссылку для входа — пароль не нужен. Новым аккаунтам доступ открывает администратор.|Enter your work address. We will email a login link — no password needed. New accounts are opened by an administrator.
Ссылка для входа устарела. Запросите новую.|The login link has expired. Request a new one.
Рабочий адрес|Work address
Прислать ссылку для входа|Email me a login link
Выйти|Sign out
Суперадмин|Superadmin
Рабочая область аккаунта|Account workspace
Аккаунты|Accounts
Кто может входить в Sendina|Who may sign in to Sendina
Новый адрес получает доступ только после подтверждения. Рабочие области аккаунтов разделены: кампании и адресаты других аккаунтов отсюда не видны.|A new address gets access only after approval. Account workspaces are separate: campaigns and recipients of other accounts are not visible here.
Обновить|Refresh
Нажмите «Обновить», чтобы загрузить список аккаунтов.|Press Refresh to load the account list.
Роль|Role
Вход|Sign-in
Подтверждён|Approved
Заблокирован|Blocked
Ожидает подтверждения|Awaiting approval
ни разу|never
Подтвердить|Approve
Заблокировать|Block
Доступ подтверждён|Access approved
Подключения аккаунта|Account connections
Ключи модели, поиска и почтовых провайдеров хранятся в вашем аккаунте. Заполните их по шагам — сервер их не возвращает обратно.|Model, search and mail provider keys live in your account. Fill them in step by step — the server never hands them back.
Заполнить по шагам|Fill in step by step
Модель|Model
Ключ OpenAI используется для подбора адресатов и подготовки писем. Без него эти действия откажутся работать, а не начнут выдумывать.|The OpenAI key powers recipient research and message preparation. Without it those actions refuse to run rather than start inventing.
Ключ OpenAI|OpenAI key
Адрес шлюза (необязательно)|Gateway URL (optional)
С поисковым ключом кандидаты ссылаются на настоящий результат. Без него они остаются неподтверждёнными и не проходят правила.|With a search key candidates cite a real result. Without one they stay unverified and never pass the rules.
Провайдер|Provider
Ключ поискового API|Search API key
Создайте OAuth-приложение в Google Cloud Console со scope gmail.send и укажите адрес возврата ниже.|Create an OAuth application in Google Cloud Console with the gmail.send scope, then register the redirect address below.
Создайте приложение в Entra ID со scope Mail.Send и offline_access, затем укажите адрес возврата ниже.|Create an application in Entra ID with the Mail.Send and offline_access scopes, then register the redirect address below.
Идентификатор тенанта|Tenant id
Адрес возврата (укажите его у провайдера)|Redirect address (register it with the provider)
Уже заполнено. Пустое поле оставит сохранённое значение без изменений.|Already filled in. An empty field keeps the stored value.
Поля пока не заполнены.|These fields are not filled in yet.
Назад|Back
Сохранить и далее|Save and continue
Сохранить и закрыть|Save and close
Пропустить шаг|Skip this step
Настройки сохранены|Settings saved
Для этого действия подключите сервер в настройках.|Connect a server in Settings for this action.
Это демонстрация в браузере: вход не требуется. Подключите сервер, чтобы работать под своим аккаунтом.|This is a browser demo: no sign-in needed. Connect a server to work under your own account.
Автоматизация работы небольшого отеля|Running a small hotel with less manual work
Совместное внедрение решений|Delivering the solution together
Получение документов|Obtaining documents
Добавьте коннектор с этим адресом в ChatGPT. На экране согласия введите код коннектора — он привязывает чат ровно к вашему аккаунту.|Add a connector with this address in ChatGPT. On the consent screen enter the connector code, which binds the chat to your account alone.
Код коннектора|Connector code
Показать код|Show the code
Создать новый|Create a new one
Код коннектора заменён|The connector code was replaced
Введите адрес корпоративного ящика. Остальное Sendina определит сама по домену: это ещё не подключение.|Enter a corporate mailbox address. Sendina works out the rest from the domain, which is not yet a connection.
Продолжить|Continue
Приложение Sendina — client id вводить не нужно.|Sendina's own application — no client id to enter.
Используется приложение вашего аккаунта.|Your account's own application is used.
Приложение|The application for
ещё не настроено. Это делает администратор Sendina один раз на всю платформу; до этого ящик можно подключить как обычный корпоративный.|is not set up yet. A Sendina administrator does that once for the whole platform; until then the mailbox can be connected as an ordinary corporate one.
Изменить вручную|Change by hand
Автоматически определить настройки не удалось. Их можно взять в панели вашего почтового провайдера.|Automatic detection did not succeed. Your mail provider's control panel has these values.
SMTP порт|SMTP port
IMAP порт|IMAP port
Шифрование TLS для SMTP|TLS encryption for SMTP
Шифрование TLS для IMAP|TLS encryption for IMAP
Пароль или пароль приложения|Password or app password
Пароль шифруется на сервере и никогда не возвращается в интерфейс. После подключения Sendina проверит вход, отправку, приём и прочитает тестовое письмо обратно.|The password is encrypted on the server and never returned to the interface. After connecting, Sendina checks the login, a send, the incoming channel, and reads that test message back.
Подключить и проверить|Connect and verify
Ящик подключён и проверен|The mailbox is connected and verified
Ящик подключён. Проверка:|Mailbox connected. Checks:
Проверить ящик|Verify the mailbox
Принять ответы|Fetch replies
Ящик проверен и готов|The mailbox is verified and ready
Проверка:|Checks:
Принято ответов:|Replies taken in:
без совпадения:|unmatched:
принято из почтового ящика|taken in from the mailbox
Вход|Sign-in
Отправка|Sending
Приём|Receiving
Чтение письма|Reading the message
Нужна проверка входа|The login is not verified yet
Вход не принят|The login was refused
Нужна проверка приёма|The incoming channel is not verified yet
Приём почты недоступен|The incoming channel does not answer
Тестовое письмо ещё не прочитано|The test message has not been read back
Тестовое письмо не пришло|The test message never arrived
Приложения платформы|Platform applications
Это настройка администратора, а не пользователя. Заполните её один раз — и все аккаунты будут подключать Google и Microsoft одной кнопкой, без ввода client id.|This is an administrator setting, not a user one. Fill it in once and every account connects Google and Microsoft with a single button, with no client id to enter.
Адрес возврата для обоих провайдеров:|Redirect address for both providers:
Шифрование секретов:|Secret encryption:
ключ из переменных окружения|key from the environment
ключ создан сервером — задайте ENCRYPTION_KEY для более надёжного варианта|key generated by the server — set ENCRYPTION_KEY for a stronger option
Тенант Microsoft|Microsoft tenant
Сохранить приложения|Save the applications
Приложения платформы сохранены|Platform applications saved
Настроено|Configured
Не настроено|Not configured
Заполнено|Filled in
Обычно это заполняет администратор Sendina один раз на всю платформу, и вам ничего вводить не нужно. Эти поля — запасной вариант: своё приложение Google Cloud Console со scope gmail.send и gmail.readonly.|A Sendina administrator normally fills this in once for the whole platform, leaving you nothing to enter. These fields are the fallback: your own Google Cloud Console application with the gmail.send and gmail.readonly scopes.
Тоже обычно настраивает администратор платформы. Запасной вариант — своё приложение Entra ID со scope Mail.Send, Mail.Read и offline_access.|Normally set up by the platform administrator as well. The fallback is your own Entra ID application with the Mail.Send, Mail.Read and offline_access scopes.
Завершите согласие в открывшейся вкладке, затем проверьте ящик|Finish the consent in the new tab, then verify the mailbox
Демонстрация в браузере: определить провайдера по MX нельзя. Подключите сервер, чтобы Sendina сделала это сама.|Browser demo: MX records cannot be read here. Connect a server and Sendina works the provider out itself.
Рекомендуем|Recommended
Сделать всё за меня|Do it all for me
Опишите продукт и цель. Sendina сама найдёт компании и адресатов, проверит источники и подготовит персональные письма.|Describe the product and the goal. Sendina finds the companies and the people, checks the sources and writes each message.
От вас: описание продукта и подтверждение первой партии.|From you: a description of the product and approval of the first batch.
Начать|Start
У меня уже есть адресаты|I already have recipients
Загрузите свои контакты. Поиск компаний пропускается, всё остальное — проверка, письма, правила, ответы — работает так же.|Bring your own contacts. Company research is skipped; the checks, the messages, the rules and the replies work exactly the same.
От вас: список адресатов с источником и причиной обращения.|From you: a list of recipients with a source and a reason for writing.
Загрузить контакты|Load contacts
Настроить вручную|Set it up myself
Полный контроль: источники, подключение почты, правила отправки, адресаты и письма по отдельности.|Full control: sources, mail connection, sending rules, recipients and messages one by one.
От вас: настройка каждого шага самостоятельно.|From you: every step configured by hand.
Открыть рассылки|Open campaigns
Запуск кампании|Campaign launch
Четыре вопроса — и Sendina сама найдёт компании, адресатов и подготовит письма.|Four questions, and Sendina finds the companies and the people and writes the messages.
Опишите предложение, чтобы письма были персональными. Адресатов вы добавите на следующем шаге.|Describe the offer so the messages can be personal. You add the recipients on the next step.
Что продаём|What are we selling
Какую проблему это решает|What problem does it solve
Чего хотим добиться|What do we want
Целевое событие|Target event
Где ищем|Where to look
Пусть Sendina порекомендует|Let Sendina recommend
Продажа услуги|Selling a service
Поиск инвесторов|Finding investors
Найм|Hiring
Обращение|An official request
Демонстрация|A demonstration
Рынок:|Market:
Sendina найдёт реальные организации, проверит источники и оставит адресатом только того, чей адрес подтверждается источником.|Sendina finds real organisations, checks the sources, and keeps as a recipient only someone whose address the source supports.
Добавить своих|Add my own
Вставьте адресатов списком JSON. Для каждого нужны источник, основание и конкретная причина обращения — без причины письмо будет помечено как спам.|Paste the recipients as a JSON list. Each needs a source, a legal ground and a specific reason for writing; without a reason the message is marked as bulk mail.
Проверить и показать письма|Check them and show the messages
Поиск по реальным организациям|Search over real organisations
Ниже — первые письма целиком.|The first messages are shown in full below.
Подходящих адресатов пока нет.|No suitable recipients yet.
Почему выбран:|Why this one:
Доказательство:|Evidence:
адрес не подтверждён|address not verified
Как запускаем|How we launch
Подтвердить первую партию|Approve the first batch
Полностью автоматически|Fully automatic
Полностью вручную|Fully by hand
Отправитель не подключён. Правила не пропустят отправку, пока ящик не подключён и не проверен.|No sender is connected. The rules will not allow sending until a mailbox is connected and verified.
Подключить отправителя|Connect a sender
Подтвердить и запустить|Approve and launch
Оставить черновиком|Leave it as a draft
Кампания запущена. Отправка пойдёт в рамках правил.|The campaign is running. Sending stays inside the rules.
Настройки определены автоматически|Settings were detected automatically
Показать и изменить вручную|Show them and change by hand
Инфраструктура поиска и модели|Search and model infrastructure
Заполненное здесь работает для всех аккаунтов, и обычному пользователю не придётся вводить ни одного ключа.|What is filled in here works for every account, and an ordinary person never has to enter a key.
Ключ модели|Model key
Поиск в интернете|Web search
Ключ поиска|Search key
Поиск организаций|Organisation search
Ключ поиска организаций|Organisation search key
Сохранить настройки платформы|Save the platform settings
Модель и поиск уже предоставлены Sendina — заполнять ничего не нужно. Эти поля пригодятся, только если вы хотите работать на своих ключах.|Sendina already provides the model and the search, so there is nothing to fill in. These fields only matter if you would rather use your own keys.
Ключи модели и поиска пока не настроены администратором. Их можно указать здесь, для своего аккаунта.|An administrator has not set up the model and search yet. You can supply them here for your own account.
Обычно ключ предоставляет Sendina, и заполнять это поле не нужно. Укажите свой, только если хотите работать на собственном ключе.|Sendina normally provides the key and this field can stay empty. Fill it in only to work on your own key.
Тоже обычно предоставлено платформой. Свой ключ поиска нужен, только если вы хотите отделить свои запросы от общих.|Normally provided by the platform as well. Your own search key only matters if you want your queries kept separate.
Нужно подтверждение первой партии|The first batch is not approved yet
Отправка только вручную|Sending is fully by hand
Режим контроля|Control mode
Что стоит продавать в выбранной точке прямо сейчас.|What is worth selling where you are looking, right now.
Где продавать то, что у вас есть.|Where to sell what you already have.
Почта, интеграции, исключения и рабочая область.|Mail, integrations, exclusions and your workspace.
Доступ, подтверждение и режим поддержки.|Access, approval and support mode.
Отправитель готов|Sender ready
Отправитель не подключён|No sender connected
Почта и домены|Mail & domains
Домены и почта|Mail & domains
Интеграции|Integrations
Запрещённые адресаты|Blocked recipients
Кампаний пока нет. Создайте первую рассылку — или начните с «Возможностей».|No campaigns yet. Create your first one — or start from Opportunities.
Введите рабочий адрес — Sendina сама определит провайдера. Технические параметры SMTP и IMAP нужны только в расширенной настройке, если определить автоматически не удалось.|Enter a work address and Sendina detects the provider itself. SMTP and IMAP details are only needed in advanced setup, if detection fails.
Ящики не подключены. Пока Sendina не может отправить ни одного письма.|No mailboxes connected. Until then Sendina cannot send anything.
Модель, веб-поиск и поиск организаций настраиваются здесь один раз — для всех аккаунтов. Обычный пользователь не вводит платформенных ключей вообще.|The model, web search and organisation search are set up here once, for every account. An ordinary user never enters a platform key.
Загрузить текущие настройки|Load current settings
Адрес возврата для Google и Microsoft:|Redirect URL for Google and Microsoft:
Демонстрационный режим · кампании, ответы и показатели — примеры|Demo mode · campaigns, replies and metrics are samples
Очистить рабочую область|Clear the workspace
Я ещё не выбрал, что продавать|I have not chosen what to sell
Задайте страну или отрасль — Sendina исследует и предложит шесть актуальных возможностей с оценкой и обоснованием.|Name a country or an industry — Sendina researches and proposes six current opportunities, each scored and explained.
От вас: территория или направление, остальное необязательно.|From you: a territory or a direction; everything else is optional.
Искать возможности|Find opportunities
Готовность отправителя|Sender readiness
Подключите и проверьте почтовый ящик|Connect and verify a mailbox
Ответов получено|Replies received
Смотрите ветки в разделе «Ответы»|See the threads under Replies
Ответы появятся после первых отправок|Replies appear after the first sends
Кампаний|Campaigns
В избранном|Saved
Сохранённые возможности и рынки|Saved opportunities and markets
Найти возможность или создать первую кампанию|Find an opportunity or create your first campaign
Подключить и проверить почтовый ящик|Connect and verify a mailbox
Найти адресатов для кампании|Find recipients for a campaign
Проверить письма и подтвердить первую партию|Review the letters and approve the first batch
Разобрать полученные ответы|Work through the replies you received
Перейти|Open
Избранные возможности|Saved opportunities
Название|Name
Избранного пока нет. Исследуйте возможности и сохраните лучшие.|Nothing saved yet. Research opportunities and keep the best ones.
Этот раздел доступен только суперадминам.|This section is for superadmins only.
Управляйте Sendina из чата: ищите возможности, исследуйте рынки, создавайте кампании и смотрите результаты. Чат видит ровно те же данные, что и этот интерфейс.|Run Sendina from a chat: find opportunities, research markets, create campaigns and read results. The chat sees exactly the data this interface shows.
Модель и поиск предоставлены Sendina — вводить ключи не нужно. Эти поля пригодятся, только если вы хотите работать на своих.|Sendina provides the model and the search, so no keys are needed. These fields only matter if you would rather use your own.
Ключи модели и поиска пока не настроены администратором. До этого исследование и поиск адресатов работать не будут.|An administrator has not set up the model and search keys yet. Until then research and recipient search will not run.
Свои ключи (расширенно)|Your own keys (advanced)
Этим адресам и доменам Sendina не отправляет ничего и никогда. Отказ и отписка попадают сюда автоматически и действуют во всех кампаниях рабочей области.|Sendina never sends anything to these addresses and domains. A refusal or an unsubscribe lands here automatically and applies across every campaign in the workspace.
Добавить в запрещённые|Add to blocked
Список пуст.|The list is empty.
Создание кампаний, исследования, проверки и изменения состояния сохраняются с датой и идентификатором.|Campaign creation, research, checks and status changes are stored with a date and an identifier.
В рабочей области сейчас демонстрационные кампании, ответы и показатели. Очистите её, прежде чем работать по-настоящему.|The workspace currently holds demonstration campaigns, replies and metrics. Clear it before doing real work.
Рабочая область содержит только ваши собственные данные. Демонстрацию можно включить, чтобы посмотреть, как выглядит заполненная система.|The workspace holds only your own data. Turn the demonstration on to see what a populated system looks like.
Включить демонстрацию|Turn on the demonstration
Демонстрационный режим включён|Demonstration mode enabled
Демонстрационные данные удалены|Demonstration data removed
Состояние хранилища|Storage state
PostgreSQL подключён: данные переживают передеплой.|PostgreSQL is connected: data survives a redeploy.
Хранилище — файл контейнера. Подключите PostgreSQL, иначе данные пропадут при передеплое.|Storage is a container file. Connect PostgreSQL, or data is lost on redeploy.
Файл контейнера|Container file
Рабочая область сохраняется|Workspace is persisted
Хранилище не настроено|Storage not configured
Адрес сервера, служебные токены и состояние хранилища — администраторская информация. Если что-то не работает, обратитесь к администратору Sendina.|The server address, service tokens and storage state are administrator information. If something does not work, contact your Sendina administrator.
Сейчас открыта демонстрация в браузере. Укажите адрес сервера, чтобы войти под своим аккаунтом.|You are viewing the browser demonstration. Enter a server address to sign in to your own account.
Авторизация:|Authorization:
Инструкция подключения ↗|Connection guide ↗
Введите рабочий адрес — Sendina определит провайдера сама. Это ещё не подключение.|Enter a work address and Sendina detects the provider itself. This is not a connection yet.
Рабочий e-mail|Work e-mail
Расширенная настройка|Advanced setup
Расширенная настройка. Эти параметры есть в панели вашего почтового провайдера.|Advanced setup. These values are in your mail provider control panel.
Изменить вручную|Edit by hand
Готовность к отправке|Sending readiness
Отправка возможна|Sending is possible
Отправка невозможна|Sending is not possible
Нет проверенного ящика|No verified mailbox
Не задан суточный лимит домена|No daily domain limit set
Суточный лимит домена исчерпан|The domain's daily limit is used up
Отправка выключена на развёртывании|Sending is off on this deployment
Ни один ящик пока не прошёл все четыре проверки, поэтому отправлять не через что.|No mailbox has passed all four checks yet, so there is nothing to send through.
Контролируемая отправка|Controlled sending
Писем в сутки|Messages a day
Сохранить лимит|Save the limit
Отправлено сегодня:|Sent today:
Суточный лимит домена сохранён|The daily domain limit is saved
Отправка|Sending
Репетиция без отправки|Rehearse without sending
Отправить по-настоящему|Send for real
Репетиция: ничего не отправлено|Rehearsal: nothing was sent
Репетиция выполнена: ничего не отправлено|The rehearsal has run: nothing was sent
Результат отправки|What the run did
Готово к отправке:|Ready to send:
Уже отправлено:|Already sent:
Прошло бы|Would have gone
Отправлено|Sent
Заблокировано|Blocked
Ошибка|Error
Отправитель:|Sender:
Отправлено писем:|Messages sent:
Разрешённые адреса:|Permitted addresses:
Ни одного письма в очереди.|No messages in the queue.
Адрес не в списке разрешённых|The address is not on the permitted list
Ошибка отправки|Sending failed
Письмо уже отправлено|The message was already sent
Достигнут суточный лимит домена|The domain's daily limit is reached
Открыть готовность к отправке|Open sending readiness
Настройки определены автоматически|Settings detected automatically
Расширенный способ подключения (SMTP и IMAP по паролю приложения)|Advanced connection method (SMTP and IMAP with an app password)
Подключение через Google пока недоступно.|Connecting through Google is not available yet.
Подключение через Microsoft пока недоступно.|Connecting through Microsoft is not available yet.
Приложение платформы ещё не настроено администратором Sendina. Пока этого не произошло, ящик можно подключить расширенным способом — по паролю приложения.|The platform application has not been set up by a Sendina administrator yet. Until it is, the mailbox can be connected the advanced way, with an app password.
OAuth-приложение Google платформы не настроено.|The platform Google OAuth application is not configured.
OAuth-приложение Microsoft платформы не настроено.|The platform Microsoft OAuth application is not configured.
Настроить приложение платформы|Set up the platform application
Адрес возврата для приложения:|Redirect URI for the application:
Проверка ящика|Mailbox check
Скрыть результат|Hide the result
Остановилась:|Stopped at:
Причина:|Reason:
Сервер прервал шаг по таймауту — узел принял соединение, но не ответил. Проверьте host, порт и шифрование.|The server cut the step off at its deadline: the host accepted the connection and then did not answer. Check the host, the port and the encryption.
Провайдер отклонил пароль. Для Gmail и Microsoft 365 нужен пароль приложения, а не обычный пароль аккаунта.|The provider rejected the password. Gmail and Microsoft 365 need an app password, not the ordinary account password.
Узел не найден в DNS — проверьте имя сервера.|The host was not found in DNS: check the server name.
Чтение письма|Reading the message
Отправка|Sending
Приём|Receiving
Поиск организаций|Organisation search
Первый слой подбора адресатов: реальные организации из справочника, до того как что-либо ищет человека или адрес. Провайдер — Google Places. Это платформенная настройка: ключ задаётся один раз для всех аккаунтов, отдельных полей у аккаунта здесь нет.|The first layer of recipient research: real organisations from a directory, before anything looks for a person or an address. The provider is Google Places. This is a platform setting: the key is entered once for every account, and there are no per-account fields here.
К Google Workspace отношения не имеет: это разные приложения и разные ключи. Google Workspace — подключение почтового ящика, Google Places — справочник организаций.|It has nothing to do with Google Workspace: these are different applications and different keys. Google Workspace connects a mailbox; Google Places is a directory of organisations.
Настроить на экране «Аккаунты»|Set up on the Accounts screen
Настраивает администратор Sendina.|Set up by a Sendina administrator.
Провайдер:|Provider:
Google Places API key|Google Places API key
Справочник реальных организаций для подбора адресатов. Это|A directory of real organisations for recipient research. This is
не Google Workspace: отдельное приложение и отдельный ключ. Нужен Places API (New), включённый в проекте Google Cloud. Ключ хранится зашифрованным и обратно в интерфейс не возвращается.|not Google Workspace: a separate application and a separate key. It needs the Places API (New) enabled in a Google Cloud project. The key is stored encrypted and is never returned to the interface.
Системная почта|Platform mail
Настроена|Configured
Не настроена|Not configured
Обязательные переменные окружения:|Required environment variables:
Необязательные:|Optional:
не задана|not set
задана|set
Отправить проверочное письмо себе|Send a test message to yourself
Обновить состояние|Refresh the status
Проверочное письмо отправлено:|Test message sent:
Не отправлено|Not sent
Проверка системной почты выполнена|The platform mail check has run
Пока системная почта не настроена, обычный пользователь войти не может: ссылка ему не отправляется. Суперадмин входит по ссылке из журнала сервера — это временный обходной путь, а не рабочий сценарий.|Until platform mail is configured an ordinary user cannot sign in at all, because no link is sent to them. A superadmin signs in with the link from the server log, which is a temporary way round rather than a working arrangement.
Записей пока нет.|No entries yet.
Записей нет.|No entries.
Целевое событие:|Target event:
Поиск возможностей|Opportunity search
Исследовано:|Researched:
Все поля необязательны. Чем точнее условие, тем конкретнее шесть предложений.|Every field is optional. The more precise the condition, the more concrete the six proposals.
Страна, регион или город|Country, region or city
Направление или отрасль|Direction or industry
Дополнительное условие|Additional condition
Идёт исследование…|Researching…
Возможностей пока нет. Задайте условия и нажмите «Найти возможности».|No opportunities yet. Set your conditions and press Find opportunities.
Избранное|Saved
Избранное пусто. Сохранённое здесь остаётся, когда вы запускаете новый поиск.|Nothing saved. What you keep here stays when you run a new search.
Исследование выполнено|Research complete
Сохранено в избранное|Saved
Удалено из избранного|Removed from saved
Кампания создана из возможности|Campaign created from the opportunity
Кампания создана из рынка|Campaign created from the market
Например, стоматологии или логистика|For example, dental clinics or logistics
Например, чек от 2000 $|For example, a ticket above $2,000
Например, Нью-Йорк|For example, New York
Например, автоматизация записи для клиник|For example, booking automation for clinics
Исследование рынка|Market research
У меня есть страна|I have a country
У меня есть ниша|I have a niche
Оценить моё сочетание|Score my combination
Выберите территорию — Sendina предложит шесть самых перспективных ниш для неё на сегодня.|Choose a territory and Sendina proposes the six most promising niches for it today.
Опишите нишу, продукт или направление — Sendina предложит шесть самых перспективных стран или регионов.|Describe a niche, product or direction and Sendina proposes the six most promising countries or regions.
Задайте и локацию, и нишу — Sendina только оценит это сочетание и не предложит других.|Give both a location and a niche and Sendina only scores that combination, proposing nothing else.
Ниша, продукт или направление|Niche, product or direction
Исследовать рынок|Research the market
Оценить сочетание|Score the combination
Результатов пока нет. Выберите режим и запустите исследование.|No results yet. Pick a mode and run the research.
Для кого|Who it is for
Боль|Problem
Почему сейчас|Why now
Почему эта локация|Why this location
Платёжеспособность|Ability to pay
Доступность адресатов|Recipient reach
Почему такая оценка|Why this score
Источники исследования|Research sources
В избранное|Save
Удалить из избранного|Remove from saved
Реализация|Implementation
Продажа|Sales
Конкуренция|Competition
Правовой риск|Legal risk
Срочность|Urgency
Готовность платить|Willingness to pay
Доступность покупателей|Buyer reach
Преимущество от ИИ|AI advantage
Размер рынка|Market size
Сложность реализации|Implementation difficulty
Сложность продажи|Sales difficulty
низкая|low
средняя|medium
высокая|high
Все|All
С ответом|Replied
Ждут ответа|Awaiting a reply
Есть незакрытое действие|Open action
Входящее|Incoming
Исходящее|Outgoing
Решение системы:|System decision:
Следующее действие:|Next action:
Переписки ещё нет.|No correspondence yet.
Итог|Outcome
Следующее действие выполнено|Next action done
Выполнено|Done
Не выполнено|Not done
Действий не требуется|No action needed
Ответа ещё нет|No reply yet
Адресат уже исключён|Recipient already excluded
Ветка обновлена|Thread updated
Переписок в этой категории пока нет. Они появятся, когда кампания отправит первые письма и придут ответы.|No conversations in this category yet. They appear once a campaign sends its first letters and replies arrive.
Встреча назначена|Meeting scheduled
Документы получены|Documents received
Интерес|Interest
Ещё нет результата|No outcome yet
Другой результат|Another outcome
Есть ответ|Replied
Письмо отправлено, ответа нет|Letter sent, no reply
Черновик письма|Draft letter
Черновик, отправка не выполнялась|Draft, never sent
Ответ|Reply
Классифицировано:|Classified as:
Предложить время встречи|Propose a meeting time
Ответить на уточнение и назвать следующий шаг|Answer the question and name the next step
Снять возражение фактами и предложить короткий разговор|Address the objection with facts and offer a short call
Написать названному коллеге, сославшись на переадресацию|Write to the named colleague, citing the referral
Поставить напоминание и вернуться позже|Set a reminder and come back later
Ничего не отправлять: адресат исключён|Send nothing: the recipient is excluded
Дождаться ответа человека|Wait for a human reply
Проверить адрес: письмо не доставлено|Check the address: the letter was not delivered
Дождаться ответа|Wait for a reply
Период|Period
Сегодня|Today
Вчера|Yesterday
7 дней|7 days
30 дней|30 days
90 дней|90 days
Всё время|All time
Произвольный период|Custom range
С|From
По|To
Кампании|Campaigns
Активные|Active
Завершённые и на паузе|Finished and paused
Расчёт за|Calculated over
Сравнение с|Compared with
без изменений|no change
к предыдущему периоду|vs the previous period
Демонстрационная рабочая область|Demonstration workspace
Показатели считаются по примерам. В обычном аккаунте здесь только собственные события.|Figures are computed from samples. In an ordinary account only your own events appear here.
Выберите период, чтобы посчитать показатели.|Choose a period to compute the figures.
Писем подготовлено|Letters prepared
Ответов|Replies
Встреч назначено|Meetings scheduled
Кампания целиком|The whole campaign
создана|created
состояние:|status:
Подготовлено|Prepared
Ответы по дням|Replies by day
За выбранный период ответов не было.|There were no replies in the selected period.
В выбранном периоде кампаний нет.|There are no campaigns in the selected period.
Новый адрес получает доступ только после подтверждения. Рабочие области разделены: чужие кампании и адресаты доступны только в режиме поддержки, и только для чтения.|A new address gets access only after approval. Workspaces are separated: another account's campaigns and recipients are reachable only in support mode, and only for reading.
Аккаунтов пока нет.|No accounts yet.
Просмотреть как пользователь|View as user
Просмотр как пользователь · только чтение|View as user · read only
Вы смотрите рабочую область|You are viewing the workspace of
. Изменить в ней ничего нельзя: Sendina не выдаёт сессию этого аккаунта, а сам просмотр записан в журнал поддержки.|. Nothing in it can be changed: Sendina issues no session for that account, and the visit itself is written to the support log.
К списку аккаунтов|Back to accounts
только чтение|read only
Переписки|Conversations
Исключено адресов|Excluded addresses
Письма|Letters
Кампаний нет.|No campaigns.
Домен|Domain
Ящики|Mailboxes
Готовность|Readiness
Ящики не подключены.|No mailboxes connected.
Последний ответ|Last reply
Классификация|Classification
Переписок нет.|No conversations.
Журнал рабочей области|Workspace activity log
Журнал поддержки|Support log
Кто, когда и чью рабочую область открывал. Любое изменение чужих данных в будущем станет отдельным привилегированным действием и попадёт сюда же.|Who opened whose workspace, and when. Any future change to another account's data becomes its own privileged action and is recorded here too.
Регион|Region
Не задан|Not set
Город (необязательно)|City (optional)
Пусть Sendina выберет территорию сама|Let Sendina choose the territory
Территорию выберет Sendina и назовёт её в результате.|Sendina will choose the territory and name it in the result.
Начните вводить страну|Start typing a country
Поиск страны|Country search
Убрать страну|Remove country
Выбирает Sendina|Sendina chooses
Веб-поиск не подключён: результаты основаны только на знаниях модели.|Web search is not connected: results rely on the model's own knowledge.
Укажите страну или регион.|Name a country or a region.
Укажите нишу, продукт или направление.|Name a niche, product or direction.
Для ручной оценки нужны и локация, и ниша.|Scoring by hand needs both a location and a niche.
Возможность не найдена. Выполните поиск заново или откройте избранное.|Opportunity not found. Run the search again or open your saved list.
Такой возможности нет в избранном|That opportunity is not in your saved list
Поднимают оценку:|Raising the score:
Снижают:|Lowering it:
`;
/** Country and region names come from the geography module rather than being repeated here,
    so the selector and the dictionary can never disagree about what a country is called. */
const geography=Object.fromEntries([
 ...countries.map(c=>[c.ru,c.en]),
 ...regions.map(r=>[r.id,r.en])
]);
/** JSX folds a wrapped line into one space, so a key written across two lines here would never
    match the text React actually renders. Keys and lookups are both squashed to single spaces. */
const squash=(text:string)=>text.replace(/\s+/g,' ').trim();
const entries:[string,string][]=[];
for(const line of pairs.trim().split(String.fromCharCode(10))){
 const at=line.indexOf('|');
 if(at<0)continue;
 entries.push([squash(line.slice(0,at)),line.slice(at+1)]);
}
export const dictionary:Record<string,string>={...geography,...Object.fromEntries(entries)};
const ordered=Object.keys(dictionary).filter(k=>/[А-Яа-яЁё]/.test(k)).sort((a,b)=>b.length-a.length);
// Word boundaries keep a short key such as "Адрес" from being replaced inside "Адресаты".
const pattern=new RegExp('(?<![А-Яа-яЁё])(?:'+ordered.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')(?![А-Яа-яЁё])','g');
export function translate(text:string,locale:Locale){
 if(locale==='ru')return text;
 return dictionary[text]??dictionary[squash(text)]??text.replace(pattern,key=>dictionary[key]);
}
/** Translate presentation text while preserving option values, form data and handlers. */
export function localize(node:React.ReactNode,locale:Locale):React.ReactNode{
 if(typeof node==='string')return translate(node,locale);
 if(Array.isArray(node))return node.map(n=>localize(n,locale));
 if(!React.isValidElement(node))return node;
 const props=node.props as Record<string,any>;
 if(props['data-user-content'])return node;
 const updates:Record<string,any>={};
 for(const key of ['placeholder','aria-label','title','alt'])if(typeof props[key]==='string')updates[key]=translate(props[key],locale);
 if(node.type==='option'&&props.value===undefined)updates.value=props.children;
 if(props.children!==undefined)updates.children=localize(props.children,locale);
 return React.cloneElement(node,updates);
}

/** The walker below can only reach the tree it is handed. A screen rendered as its own component
    produces its tree later, inside React, so it localizes its own output through this context —
    which is also how a component nested in another one stays translated. */
export const LocaleContext=React.createContext<Locale>('ru');
export function useLocalize(){
 const locale=React.useContext(LocaleContext);
 return (node:React.ReactNode)=>localize(node,locale);
}
