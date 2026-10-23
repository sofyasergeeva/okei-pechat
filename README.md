# ОКЭИ ПЕЧАТЬ

Приложение на HTML/CSS/JavaScript ES Modules без сборщика. Есть два независимых режима:
локальный дизайн-прототип и серверный сценарий PDF-заказов. Node.js 24 или новее.

## Запуск серверного режима

```powershell
npm.cmd ci
Copy-Item .env.example .env
# Заполни STAFF_LOGIN, STAFF_PASSWORD и при необходимости STAFF_NAME в локальном .env.
npm.cmd run setup:staff
npm.cmd run start:server
```

Открой **http://127.0.0.1:8080/?mode=server**. Зарегистрируй тестового заказчика в интерфейсе.
Сотрудник входит с учётной записью, созданной командой setup:staff. Демо-логины здесь не действуют.
Команда создания сотрудника не меняет роль существующего пользователя: занятый логин отклоняется.
После создания сотрудника убери STAFF_PASSWORD из .env; пароль уже хранится в БД как scrypt-хеш.
.env и хранилище исключены из Git. Реальный .env автоматически не создавался.

В серверном режиме работают регистрация, вход/выход, восстановление сессии после reload,
профиль, загрузка и заказ PDF, общая очередь сотрудника, проверка файла, уточнения/переписка,
статусы, явное начало печати, отмена до него, выдача с отметкой оплаты и CSV.
Цена вычисляется на сервере исходным OrderMath;
присланные клиентом цена, число страниц, владелец и роль не принимаются как источник истины.
Тарифы, включая обозначенные демонстрационные цены duplex, не изменены.

Обновление данных: сотрудник использует «Обновить», заказчик открывает страницу заказов/заказ
или перезагружает страницу. Автоматической доставки изменений через WebSocket/SSE пока нет.
Для двух браузеров/устройств нужен один доступный им адрес API и одинаковый PUBLIC_ORIGIN.
Для локальной сети задай HOST=0.0.0.0 и PUBLIC_ORIGIN с адресом компьютера; HTTP допустим только
для изолированной учебной проверки. При внешнем размещении необходим HTTPS через reverse proxy,
PUBLIC_ORIGIN с https и COOKIE_SECURE=true (NODE_ENV=production также включает Secure).
Запросы к API с другим Host или изменяющие запросы с другим/отсутствующим Origin отклоняются.
Проект на хостинг не публиковался.

Хранилище по умолчанию: **var/okei/okei.sqlite** и **var/okei/pdf/**, вне dist.
DATA_DIR позволяет выбрать другой приватный каталог. Сессии хранятся в SQLite; браузер получает
HttpOnly / SameSite=Strict cookie на 12 часов. В БД хранится хеш случайного токена сессии.
Для согласованной резервной копии останови сервер и скопируй DATA_DIR целиком; не копируй
только основной SQLite-файл во время записи в режиме WAL. Автоматического удаления старых PDF
и незавершённых загрузок пока нет. Лимит одного PDF — 25 МБ, 1–2000 страниц, без пароля.
В заказе допускается до 10 PDF, суммарно до 50 МБ. Файлы можно добавить, заменить или убрать
до оформления. Параметры и диапазон страниц общие для всех PDF; диапазон должен подходить
каждому документу. Цена — сумма отдельных расчётов: каждый PDF начинается на новом листе,
непарная страница и переплёт учитываются отдельно. Документы не склеиваются и не архивируются.
Сотрудник открывает и скачивает каждое вложение из карточки заказа.

«В работе» означает подготовку, а не начало печати. Пока сотрудник не нажал «Начать печать»,
заказчик может отменить свой new/work/attention/review. Сервер записывает время начала печати;
после него отмена запрещена. Отменённый заказ с временем отмены и всеми PDF остаётся в истории.
При конфликте начала печати и отмены применяется только одно действие, другое получает HTTP 409.
Повторная отмена не меняет историю. Готовые и выданные заказы отменить нельзя.

SQLite автоматически обновляется со схемы v1 до v2 в транзакции. Старые одиночные заказы,
сохранённые цены, сообщения и файлы остаются доступными. Время начала печати старых заказов
не выдумывается: незаписанный момент остаётся неизвестным. Старый статус work допускает
отмену до нового явного действия; старые ready/issued остаются закрытыми для отмены.

## Независимый локальный режим

```powershell
npm.cmd start
```

Открой http://127.0.0.1:8080/ без mode=server. На API-сервере адрес / также оставляет деморежим.
Прежние localStorage/IndexedDB не очищаются и автоматически на сервер не переносятся.
В серверном режиме конструктор и мерч остаются локальными: их заказы имеют отдельный ключ
okei-customer-v1:server-merch:<UUID>, макеты — отдельный идентификатор владельца в IndexedDB.
Они не попадают в серверную PDF-очередь. PNG экспортируется из конструктора; исходный JSON
макета доступен локальному сотруднику из заказа мерча в том же браузере и origin.
Серверный сотрудник не получает эти макеты. Вход в раздел мерча показывает локальный демокабинет;
возврат через навигацию к PDF/заказам/профилю открывает серверные данные.
Онлайн-оплата, восстановление пароля и авторизация колледжа не реализованы.

## Проверки

```powershell
npm.cmd test
npm.cmd run test:server
npm.cmd run test:regressions
npm.cmd run test:e2e
```

Серверные тесты используют временную SQLite и файлы. Playwright использует установленный Edge,
два независимых браузерных контекста и отдельный временный сервер. Пользовательские профили браузера
не открываются. Подробнее: [архитектура](docs/architecture.md), [тесты](tests/README.md).

## Описание исходного локального дизайн-прототипа

Следующие разделы описывают локальный деморежим и историю его разработки.

Отдельный статический дизайн-прототип. Основной Site не изменён.

Две пользовательские темы: светлая (голубой + бордо) и тёмная (стекло). Тёмная выбрана по умолчанию, выбор сохраняется в localStorage. Главная, вход, регистрация и пример главного окна после входа. Переходы, focus glow, параллакс исходной 3D PDF-композиции, состояние ошибки и успеха, reduced motion.

Тестовый вход: student_23 / okei2026; staff_01 / okei2026. Роль определяется по тестовому аккаунту без переключателя. Регистрация создаёт только временный аккаунт заказчика в памяти вкладки, не серверную учётную запись. Пароли не записываются в localStorage, cookies или на сервер. Не использовать реальные данные. «Запомнить логин» сохраняет только имя тестового логина в localStorage; пароль и сессия не сохраняются. Полный backend и авторизация колледжа не являются частью этого концепта. Hosted access принадлежит платформе Sites.

Исходная CSS PDF-скульптура, логотип и mockup футболки сохранены из согласованного проекта. Фотография футболки была создана ImageGen. Прочие коммерческие ассеты и код референсов не копировались.

Ориентиры: предоставленные пользователем палитры и видео OTP-подсветки; https://linear.app/now/behind-the-latest-design-refresh ; https://dribbble.com/shots/24516793-Interactive-Login-Form-cute-character-movements ; https://rive.app/marketplace/25899-48398-rocky-interactive-character-for-a-login-form/ ; https://github.com/DevYuriVieira/kinetic-auth-ux-showcase

Развёртывание: статическая папка dist без сборки и зависимостей.

Проверено вручную: две темы и мобильный экран 390 px, вход сотрудника, регистрация тестового заказчика и переход в его кабинет, неверный пароль. Синтаксис JS проверен node --check. Скриншоты итогового интерфейса в docs/.

## Доработка главной и форм

Услуги и прайс сгруппированы рядом с логотипом; справа тема и вход. Гостевая главная не содержит ссылку на заказы или пример личного заказа. Постоянная строка под шапкой показывает адрес, текущий статус и сегодняшние часы; раскрывается полный график, обед и выходные. Статус рассчитан по Asia/Yekaterinburg и обновляется раз в минуту. Вход в кабинет доступен после тестовой авторизации.

Светлая форма: белая карточка, поля #eef3fa, граница #788aa4; контраст границы с полем 3.16:1 и с карточкой 3.52:1, текста подсказки с полем 4.74:1. Подтверждение пароля проверяется при вводе и отправке; несовпадение останавливает регистрацию. Проверены ошибка несовпадения и успешная регистрация, сохранение темы после reload, раскрытие расписания, мобильная шапка и форма.

UX-ориентиры: https://www.nngroup.com/articles/utility-navigation/ и https://www.w3.org/WAI/WCAG21/understanding/non-text-contrast.html


## Кабинет заказчика

Расширение согласованного дизайн-превью: обзор с приоритетом уточнений и готовых заказов, постоянная полоса всех активных заказов и черновика, PDF-мастер, история/поиск/отмена/повтор заказа, мерч с логотипом и своей надписью, профиль и переписка внутри заказа. Светлая и тёмная темы сохранены. Кабинет сотрудника в этом этапе не расширялся.

PDF.js локально считает реальные страницы PDF, оригиналы хранятся в IndexedDB, параметры/заказы/чат — в localStorage отдельно по логину. При выходе и повторном входе в том же браузере заказы остаются; это не серверное хранение. Загрузка до 25 МБ, копии 1–99, диапазон проверяется и удаляет повторы. У каждой копии собственный последний непарный лист. Оплата при получении показана как сценарий; онлайн-платежей и отправки файла в типографию нет.

Тарифы duplex — явно обозначенная демонстрационная гипотеза: A4 ч/б 6 ₽/двусторонний лист, цвет 40 ₽; A3 16/80 ₽. Исходный прайс содержит только односторонние цены 4/25/10/50 ₽. Непарная последняя страница оплачивается по одностороннему тарифу. Фотобумага только односторонняя, цветная (A4 40 ₽, A3 80 ₽). Брошюровка за каждый экземпляр: до 50 физических листов 100 ₽, выше 150 ₽; диплом 525 ₽. Мерч 950 ₽/шт. также демонстрационный. Перед реальным запуском все предположения должны быть согласованы с типографией.

Проверены расчёты: 3 страницы × 2 копии — 24 ₽ односторонняя и 20 ₽ двусторонняя, 4 физических листа; A3 цвет 4 страницы duplex — 160 ₽; порог брошюровки 51 страница simplex/duplex — 354/254 ₽. Проверены повторяющиеся/неверные диапазоны, ноль копий и запрет duplex для фотобумаги. В браузере: чтение PDF, создание заказа, сохранение черновика, смена цены, локальная переписка, ответ на уточнение, оформление и отмена мерча; обзор на 390 px. Прямой переход к подтверждению также проверяет параметры. node --check для трёх JS-файлов.

Чат — локальный интерактивный прототип с честным статусом сохранения. Реальный чат реализуем через серверную авторизацию, базу сообщений с привязкой к заказу, интерфейс сотрудника, realtime/SSE/polling и подтверждения доставки/прочтения; сейчас сотрудник сообщений не получает. Демо-статусы меняются только явно через раскрываемый инструмент, не автоматически по таймеру.

UX-ориентиры: https://www.nngroup.com/articles/status-tracker-progress-update/ ; https://dribbble.com/shots/26008878-Digital-Printing-Dashboard-Print-Order-Management-UI ; https://m3.material.io/styles/typography/applying-type . Собственная реализация, без копирования исходников/иллюстраций дизайнеров.


## Предметный визуальный стиль и полный локальный конструктор

По присланным четырём скриншотам возвращены крупная PDF-скульптура, предметная композиция с курсовой и две карточки коллекции с фотографиями футболок. Существующие темы входа сохранены; кабинет сочетает тёмное стекло с бордовым/розовым, ледяным голубым и фисташковым акцентами. Параллакс, движение бумажной композиции и футболки, hover фотографий и переходы отключаются при reduced-motion. Активные заказы остаются закреплены сверху. Карточки различаются по смыслу статуса, а не случайным цветам.

В studio.js реализован Canvas-конструктор без новых библиотек: загрузка PNG/JPG/WEBP до 10 МБ, до 12 элементов на сторону, передняя/задняя сторона, несколько изображений и текстов, шрифты/цвет текста, размер/поворот, drag pointer + стрелки клавиатуры, порядок слоёв и удаление. Ткань окрашивается в фотоподложке приблизительно: оттенок ориентировочный; задняя сторона использует ту же подложку и явно помечена условной. Черновик с изображениями сохраняется отдельно по логину в IndexedDB. Изображения нормализуются до 2000 px по длинной стороне.

Экспорт текущей стороны — PNG 2400×3368 на прозрачном фоне, отдельно от фотографии футболки. Оформление сначала показывает обе стороны; затем неизменяемый снимок дизайна JSON и PNG с двумя сторонами сохраняются вместе с локальным заказом, а в истории есть просмотр макета. Повтор заказа со своим дизайном восстанавливает его в конструктор. Стоимость 950 ₽ / шт., обе стороны включены — явное демо-предположение, без реальных платежей/отправки.

Браузерная проверка: загрузка PNG, добавление/удаление элементов, текст на второй стороне, цвет футболки, размер L, тираж 2 → 1900 ₽, экспорт RGBA с прозрачным углом, создание заказа с макетом, повторное открытие сохранённого черновика после reload, изменение масштаба и сдвиг стрелкой, интерфейс 390 px и светлая тема. Проверен синтаксис studio/customer/living/app JS. Скриншоты docs/living-home-dark.jpg и docs/living-studio-dark.jpg.

Ориентир движения и товарной подачи: https://tympanus.net/Tutorials/GridToFullPreview/ и https://github.com/gwen-bo/codrops-grid-to-preview . Изучены статья/демо и описание механики; сторонние исходники и товарные изображения не копировались. Визуальные примеры пользователя — основное направление композиции.


## Единая палитра, боковая компоновка и прямое масштабирование

Светлая палитра: бумага #f2f0ec, текст #302b2c, вторичный текст #746b6c, бордовый #98263d, поверхности #faf8f5 / #e9e3de. Тёмная: #1b191b / #292528, текст #f3eeea, приглушённый акцент #d7a0aa. Зелёные/синие поверхности и красно-зелёные заливки заказов исключены. Цвета футболки по-прежнему пользовательские; предустановки — молочный, графит, бордовый, пудровый, серый.

На desktop от 1101 px — боковая навигация по композиции первого бежево-красного прототипа. Строка текущих заказов закреплена над контентом. Порядок блоков: главный экран, две предметные услуги, журнал активных заказов с отдельной фотографией готового заказа и вопросом сотрудника, конструктор, история. Один и тот же порядок в DOM и визуальной раскладке. На мобильном — горизонтальная навигация, закреплённая строка статусов, один столбец.

Формы получили единую рамку/фокус для всех полей, включая имя, группу, логин и оба пароля. Формат/бумага/размер футболки показаны открытыми переключателями. Переплёт и шрифт — собственный listbox поверх страницы с клавиатурой (стрелки, Home/End, Enter, Escape, Tab, поиск по первым буквам), актуальным выбранным значением и возвращением фокуса. Нативный select сохраняется скрытым для передачи значения существующей логике. Панель графика вынесена из stacking context в overlay над контентом; закрытие снаружи/Escape, позиционирование относительно экрана.

Canvas: восемь маркеров на выбранном изображении/тексте — углы и середины сторон. Растягивание ширины и высоты отдельно при снятом флажке пропорций; с флажком сохраняется исходное отношение. Поддерживается повёрнутый элемент; масштаб/положение ограничены областью печати. Существующий PNG-экспорт использует итоговые размеры без рамок и маркеров. Браузерная проверка фактического бокового resize: ширина 67 → 79%, высота при снятом флажке сохранена.

Переходы между разделами через View Transitions при поддержке браузера, без движения при prefers-reduced-motion; бумага/PDF и фотография сохраняют спокойную анимацию. Исправлено влияние старой transform/filter-анимации main на fixed-навигацию. Проверены: две темы, экран 390 px, форма регистрации, график поверх PDF, клавиатурный выбор брошюровки, расчёт 3 стр. × 2 копии duplex + два переплёта = 220 ₽, сохранение выбранного размера M без перерисовки, drag resize, отсутствие ошибок JS. Скриншоты docs/editorial-home-light.jpg и docs/editorial-studio-resize.jpg.

Исследование: Pinterest индексирует подборки Burgundy Website Design, Burgundy and Cream и Editorial Website Design (https://www.pinterest.com/ideas/burgundy-website-design/938082374287/ ; https://www.pinterest.com/ideas/editorial-website-design/911960170788/), часть отдельных пинов и страниц возвращает недоступность/403. Не заявляется просмотр всего Pinterest. Дополнительные доступные примеры: https://dribbble.com/shots/23969463-Hotel-Website-Design ; документация https://www.radix-ui.com/primitives/docs/components/select ; https://github.com/radix-ui/primitives ; https://motion.dev/examples/react-radix-toggle-group . Чужие изображения и исходники не копировались. Собственная buildless реализация поведения, без подключения React/Radix/Motion в этот статический прототип.


## UI polish — 23 October 2026

- Shared SVG stroke icons replace platform-dependent arrow emoji.
- Larger responsive type, shorter copy, five-item mobile navigation.
- Distinct order statuses use text, icon and restrained amber / rose / lilac accents.
- Stronger light-theme field/card separation and consistent palette-matched focus glow.
- Page/tab transitions respect reduced-motion preferences.

Validation: JavaScript syntax checks; browser previews at 320px and 390px frame widths (305px and 375px content with desktop scrollbars), no horizontal overflow on entry/authentication; desktop light and mobile dark print settings. Three-page PDF, two copies, duplex remains 20 RUB / four physical sheets under demo rates. Mobile option indicators retain reserved space. Actual iOS Safari was not available; arrows are inline SVG, independent of emoji glyph rendering.

Existing limitations remain: browser-local demo accounts/orders/messages, no production authentication, payment or employee message delivery.


## Employee workspace — 23 October 2026

The approved customer UI is pinned to commit `e7a0485ad3874eb5c10143d87cd8d5f8212ed4e7`. `docs/customer-approved.json` records the saved version and SHA-256 hashes of all 11 customer/style/math modules; these files remain unchanged. Entry integration only routes the existing employee role to the new isolated `staff.js` / `staff.css` workspace.

Employee demo: `staff_01` / `okei2026`. Queue, archive and group accounting share the approved light and dark palettes. Desktop uses a master/detail workbench; mobile uses a full-height order dialog with focus containment, Escape/close handling and responsive navigation. Existing PDF sculpture appears in the desktop sidebar.

Supported local flows: status/type/search filters, source PDF opening, immutable print parameters and sheet count, constructor PNG preview / JSON source downloads, file-check gate before work, ready state, payment-confirmed handover, cancellation with reason, order conversations, pause for clarification, customer reply review, group totals and CSV export. Status transitions are explicit; money is never moved. Pricing remains the amount captured at order submission.

Data: employee examples are isolated under `okei-staff-demo-v1`. Existing local customer orders are discovered under `okei-customer-v1:*`; employee changes merge into the current saved order without replacing its profile or draft. Refresh reloads local orders; customers see saved staff changes on their next sign-in in the same browser. This is a local prototype, not production authentication, a cross-device service, payment processing or remote messaging.

Validation: syntax checks and diff whitespace checks; customer-module checksum comparison (11/11 unchanged); desktop light/dark inspection; 390px and 320px mobile frames. The 320px header overflow was corrected and rechecked (305px content width with a desktop scrollbar, scroll width 305px). Mobile order opens as a dialog and closes correctly. Verified: unchecked file gate blocks acceptance; new → work → ready → issued; required paid checkbox blocks handover; message pause → attention; agreed clarification → work; customer reply → review in employee workspace after refresh; staff response and review → work; cancellation with mandatory reason; archive search and empty state clear unrelated details; CSV download with 9 columns, 10 local test orders and paid/issued state recorded correctly. Browser preview blocks observation of blob: PDF tabs; the source asset opens a separate tab, but its viewer UI could not be inspected. Actual iOS Safari is unavailable.


## Employee usability review — 23 October 2026

Reduced repetition and card clutter: compact status filters, one order ledger, quieter header, PDF / actual shirt thumbnails, secondary conditions and cancellation behind disclosures. Inspector has a scrollable parameter area and a persistent amount/action footer on desktop and mobile. Its desktop height follows available viewport space; reduced-motion preferences remain respected. Priority sorting puts customer replies first, then new work, then production and handover; older orders within a stage appear first.

Local logic improvements: message drafts and pause choices survive order/tab/filter refreshes during the current employee session and are cleared on sign-out. External changes flag the refresh action without silently replacing the visible order. Before any employee write, an order fingerprint is compared against current storage; a conflicting change aborts the action and reloads current data. This improves the local prototype only; it does not add production identity, remote delivery or cross-device consistency.

Verified in browser: text and pause choice survive switching orders; two staff tabs on the same work order, one marks ready, the other's stale action is rejected with current ready status displayed; unpaid handover remains ready, paid handover becomes issued; agreed-clarification action disabled before its check; 3-page duplex, 2 copies shows four sheets / 20 RUB; desktop light/dark; 390px and 320px frames show no page overflow; at 320px the primary action fits within the 844px viewport (top761, bottom808); compact header alignment corrected. Previous customer modules checksum verification passed (11/11 unchanged). Native iOS Safari was not available.
