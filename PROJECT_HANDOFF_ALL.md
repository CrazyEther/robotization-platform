# RIS FULL HANDOFF — ВСЕ ДОКУМЕНТЫ В ОДНОМ ФАЙЛЕ

Срез 29.09.2026. Источник: docs/handoff. Проверяйте актуальный SHA/деплой; этот файл — снимок, не background updater.

# RIS — передача проекта: с чего начинать

**Дата среза:** 29.09.2026. **Проект:** Robot Investment Studio / robotization-platform.
**Репозиторий:** https://github.com/CrazyEther/robotization-platform
**Локальное рабочее дерево при проверке:** C:\Users\Pavel kit\workspace\robot-investment-review
**Рабочая ветка:** feat/material-flow-demo-v1, **HEAD:** 4c10da97aaa94cf27f5ae0da588fc39bd6200215. На момент среза git status --short был пуст.
**Базовая ветка Simulation Core v2:** feat/simcore-v2-foundation @ 0270e709630c4d9dd8634d064fc50005e02fdaf6. PR #4 открыт к feat/anylogic-scene-workspace, **не смержен**.
**main:** другая, более старая линия. НЕ предполагать, что main содержит material-flow-demo.
**Production:** https://robotization-platform.battle-walleye.workers.dev ; public preview: https://ris-public-preview.battle-walleye.workers.dev

## Важнейший смысл задачи

Пользователь не просит красивую анимацию робота из A в B и не просит подробный складской учёт ячеек. Нужен веб-продукт, моделирующий **реальную работу объекта**: заявка → выбор ресурса → транспортировка конкретного груза/стеллажа/поддона → загрузка/выгрузка → ожидание обработки на машине/инфраструктуре → появление или сохранение груза → следующее задание/склад/выход; и аналогичные процессы для производства, медицины и аэропортов. Движение, очереди, простои, состояние груза, ограничения инфраструктуры и KPI должны происходить из одного исполняемого событиями процесса. Результаты должны передаваться в инвестиционную модель CAPEX/OPEX/TCO/ROI/NPV.

**Проблема исходного сайта:** основной шаблон был A→B. Стеллажи в основном blocking rectangles; cargo и machine operations отсутствовали в пользовательском шаблоне. Называть это AnyLogic-class или полноценной промышленной моделью было необоснованно.
**Изменение в HEAD:** отдельный ограниченный заводской демосценарий Material Flow v1 уже содержит два транспортных плеча, состояние груза и timed machine service. Не путать с полноценным универсальным конструктором процессов и не утверждать, что он уже задеплоен: факт production deploy этого HEAD в данном срезе не подтверждён.

## Как читать пакет

1. **01_PRODUCT_REQUIREMENTS.md** — первоначальная задача и последние обязательные уточнения пользователя.
2. **02_CURRENT_STATE_EVIDENCE.md** — фактические возможности, проверки, сравнение ветки/production, честные пробелы.
3. **03_CODEBASE_MAP.md** — карта реальных файлов и связей, с чего читать исходники.
4. **04_SIMULATION_ARCHITECTURE.md** — контракты, цепочка сценарий → процесс → EventTrace → KPI → экономика; как вводить сущности груза, станки и сервис.
5. **05_ROADMAP_BACKLOG.md** — приоритетный и проверяемый план с карточками, зависимостями и условиями приёмки.
6. **06_TESTING_DEPLOYMENT.md** — команды, тесты, GitHub, Cloudflare, безопасность и правила релизов.
7. **07_ANALOGS_AND_RESEARCH.md** — готовые технические решения, ограничения внедрения и исследовательский backlog.
8. **08_HANDOFF_DECISIONS_RISKS.md** — отклонённые пути, системные ошибки прошлого, блокеры, точная точка продолжения.

## Первый безопасный шаг следующей модели

1. Проверить git branch --show-current, git rev-parse HEAD, git status --short, git fetch origin. Не менять чужие изменения и не очищать .tools без проверки диска/согласования.
2. Открыть docs/material-flow-v1.md, packages/ris/factoryFlowDemo.ts, packages/simulation-core/process-runtime.ts, packages/simulation-core/mobile-transport-runtime.ts, packages/ris/simulationCoreReplay.ts, apps/web/DigitalTwinStudio.tsx.
3. Воспроизвести пользовательский маршрут **«Загрузить производственный цикл» → «Запустить Simulation Core»** и увидеть *входной паллет → робот → станок (остановка) → новый выходной паллет → робот → выход*, проверить trace и KPI.
4. Только после воспроизведения составить gap-лист к пользовательскому ТЗ. Не возобновлять самовольную попытку интеграции AnyLogic или очередной переписывания интерфейса.
5. Согласовать с пользователем один реалистичный целевой референс-сценарий (производство предпочтительно, но решение за пользователем), входные параметры, качество геометрии и источники измерений. Дальнейшая работа должна быть карточками с единым acceptance contract.

## Правила достоверности передачи

- **ПРОВЕРЕНО** — есть текущий файл, команда, конкретный SHA или наблюдение.
- **ЗАЯВЛЕНО РАНЕЕ** — есть только история диалога или старый доклад; не выдавать за свежее тестирование.
- **НЕ ПОДТВЕРЖДЕНО** — требует испытаний, данных клиента, лицензии или нового деплоя.
- Ни одна цифра тестов/ROI/доступности Cloudflare не заменяет функциональную приёмку физического процесса.
- Передача не содержит логинов, API-ключей, Supabase-токенов, содержимого .env и секретных файлов.

---

# Первоначальное ТЗ и действующие уточнения пользователя

## 1. Первоначальная продуктовая цель

Создать веб-платформу для предварительного инженерно-экономического обоснования роботизации **конкретного помещения и конкретного процесса**, а не каталог с примерной формулой окупаемости и не самостоятельную игру «робот едет по линии». Предполагаемые пользователи: руководители, топ-менеджеры, главные инженеры, интеграторы робототехники, специалисты по ТОиР/логистике и проектировщики.

Вход: реальные размеры/план объекта, операции и зависимости, типы/число и ограничения роботов и инфраструктуры, поток заданий, стоимость существующей работы и будущей автоматизации. Выход: исполняемая имитация 2D/3D, события и метрики процесса, сравнение baseline/robotized, CAPEX/OPEX/TCO/ROI/NPV/payback, отчёт с допущениями, рисками и источниками.

В первоначальных обсуждениях рассматривалась полная интеграция AnyLogic / FlexSim / AnyLogic Cloud или эквивалентных движков. Идея: пользователь **сам не должен вручную собирать AnyLogic-проект и переносить числа в наш калькулятор**. У проекта должны быть единая модель, единый расчёт и единое доказуемое сравнение.

## 2. Обязательная поддержка разных отраслей

- **Производство:** заказ/партия сырья, поддон или заготовка, требующая обработки машина, погрузка, ожидание/технологический цикл, выходная единица/поддон, дальнейшая обработка/складирование, граф и развилки.
- **Склад:** перевозка поддонов/контейнеров/стойки целиком от реального места выдачи к требующей их станции и назад/дальше, очереди на станциях и доках, смены и заряды. Детальный SKU/WMS-учёт каждой ячейки **НЕ требуется по умолчанию** и не должен блокировать первый работающий поток.
- **Медицинское учреждение:** мобильные сервисные/логистические роботы, доставляющие питание, препараты, принадлежности и расходники; помощь персоналу/пациентам, сервисные остановки, расписание, двери/лифты, безопасность и разграничение чистых/грязных потоков, если релевантно. Роботизированный «уход за пациентом» требует отдельно определить конкретную технически и клинически допустимую операцию.
- **Аэропорт:** пока **недоопределено пользователем**; исследовать багаж, наземную логистику, сервисные тележки, грузовые задания. Не назначать автоматически полноценное авиационное/airside-моделирование.
- Расширяемость: фармацевтика, лаборатории, гостиницы, уборка, доставка по кампусу и прочие сценарии. Тот же универсальный runtime, разные типизированные domain/process packs.

**Инвариант:** нет отраслевых if/else внутри базового DES/transport ядра; отраслевое поведение задаётся данными, ролями объектов, правилами, заданиями и сценарными адаптерами.

## 3. Уточнение 28–29 сентября — важнее старой гипотезы про складскую адресацию

Пользователь явно возразил против обязательной модели занятости ячеек стеллажа. Его минимальный продуктовый процесс:
1. Роботу назначают реальную задачу.
2. Робот едет к грузу/поддону/мобильному стеллажу, получает его; нужно обозначить конкретный груз и способ передачи.
3. Везёт его к станку или иной требующей его инфраструктуре.
4. Останавливается на обоснованное время обработки/сервиса; ресурсы/станок имеют вместимость, очередь, занятость, отказ, такт.
5. После операции тот же груз может измениться либо потребоваться **новый выходной поддон**; это отражается в состоянии сущностей.
6. Возникает следующее задание: другой станок/пост/склад/разгрузка/выход.
7. Тот же runtime выдаёт след событий для анимации и измерения KPI; экономика берёт показатели из этого исполнения.

Разрешить модели переносить **целый мобильный стеллаж или паллету**, если техника совместима, но не симулировать погрузочную механику манипулятора, которой нет в техническом описании. Показать state transition загрузки/передачи, пусть даже через подтверждённый параметр времени.

## 4. Пользовательский путь до окупаемости

1. Объект: выбор отрасли или пользовательского сценария.
2. Импорт PNG/JPG/PDF/DXF/DWG/JSON/плана с проверкой масштаба; неизвестные форматы — прикладывать как источник, не обещать автоматическую геометрию.
3. 2D редактор: размеры, стены, стеллажи, рабочие станции, буферы/доки, зарядки, двери, лифты и их **реальные функциональные свойства**, а не только иконки.
4. Конструктор процессов: узлы операций/источников/потребителей и переходы, предмет задания и его маршрут; шаблон должен работать без сложного ручного построения, сложные графы — редактируемы.
5. Подбор конкретного робота из каталога по грузоподъёмности, footprint, кинематике, ограничениям и доступности; пользователь может указать количество.
6. Прогон baseline и robotized для **одинаковых** demand/site/time assumptions. Отображать наблюдаемую работу: робот и груз, очереди, машина, смены, остановки, зарядка, окончания заданий.
7. KPI: throughput, completed/WIP/backlog, time-to-deliver, P50/P95, waiting, utilization, traffic, energy, downtime, charging; при необходимости качества/сроков.
8. Повторные эксперименты и чувствительность к параметрам (число роботов, спрос, скорость, время обработки, зарядки, оборудование).
9. Экономика: CAPEX, OPEX, TCO, ROI, NPV и срок окупаемости **с явными финансовыми и статистическими допущениями**. Не приравнивать «освобождённое время» автоматически к денежной экономии.
10. Проект сохраняется, восстанавливается, экспортируется в пригодный для решения отчёт; роль/права/приватность и Cloudflare развёртывание.

## 5. Деловые требования к качеству

- Пользователь должен визуально видеть именно **работающий материальный/сервисный поток**; путь A→B без грузовой сущности недостаточен.
- Стеллаж/станок/док должен быть функциональным **только там, где он участвует в сценарии**; запасной стеллаж может оставаться препятствием, не требуя WMS.
- Источник каждой KPI — тот же исполняемый run и EventTrace; никаких декоративных маршрутов, выдаваемых за измеренные.
- Геометрия и физические параметры подтверждаются; нельзя считать демонстрационный шаблон автоматически достоверным клиентским объектом.
- ROI нельзя выдавать как точность инженерного аудита, пока отсутствуют данные площадки, калибровка и финансы.
- Продолжать рабочими проверяемыми вертикальными срезами. Не обещать «готовый промышленный аналог AnyLogic» по одному успешному тесту.
- Пользователь неоднократно просил **реальное выполнение и отчёт о конкретных изменениях**, а не бесконечную архитектурную дискуссию.

## 6. Не являющиеся обязательными требованиями первого релиза

- Подробный адресный складской учёт SKU/занятости каждой ячейки.
- Полная мультифизика каждого робота/захвата, роботизированные руки, SLAM, safety PLC.
- Клонирование всех модулей AnyLogic, универсальная замена FlexSim/Gazebo.
- Автоматическое распознавание и векторизация любого загруженного PDF/DWG с гарантией корректности.
- Реальный клинический эффект или airport airside simulation без предметной постановки и валидации.
- Подмена отсутствующей инфраструктуры красивой 3D-демонстрацией.

## 7. Разрешённые решения, требующие дальнейшего выбора

- Эксплуатация собственного узкоспециализированного DES+traffic simulation versus опубликованный AnyLogic backend — benchmark/adapter, не выдавать ни то, ни другое за безусловно валидированное.
- Разработка process graph editor: нужен **первым пользователю**, чтобы уйти от hard-coded A→B; форма UI и временные оценки ещё не утверждены.
- Для тяжелых моделей Cloudflare Workers может быть orchestration layer, а вычисления — отдельными воркерами; нагрузка/цены/лицензия требуют измерения.

---

# Текущее состояние: факты, старые заявления, неподтверждённые возможности

**Срез:** 29.09.2026, локальная машина DESKTOP-SNNO6M6.
**Рабочая ветка:** feat/material-flow-demo-v1, HEAD 4c10da97aaa94cf27f5ae0da588fc39bd6200215, clean git status. Удалённая ветка origin/feat/material-flow-demo-v1 существует и указывала на этот SHA на момент проверки.
**Исходная основа:** feat/simcore-v2-foundation @ 0270e709630c4d9dd8634d064fc50005e02fdaf6, PR https://github.com/CrazyEther/robotization-platform/pull/4 открыт к feat/anylogic-scene-workspace; не merged.
**main НЕ является текущей рабочей веткой**.

## 1. Подтверждено в коде HEAD 4c10da9

| Область | Подтверждённая реализация | Ограничение |
| --- | --- | --- |
| Сценарий | Версионированный FacilityModel/ProcessModel/RobotSpec/Workload, проверки Zod, content hash | типизированный контракт сам по себе не создаёт рабочий сценарий |
| DES | process-runtime.ts, очереди и ресурсы с capacity, timed service, seeded arrivals, process graphs, decision/rework | finite buffer nodes явно reject; требуются пользовательские связи |
| Геометрия | navigation.ts, transport-network.ts, motion.ts, метры и robot footprint/clearance; axis-aligned objects | не полноценная CAD/navmesh/physical twin; turning radius описан, но не доказывает достоверную динамику |
| Роботы | fleet/traffic/charging/energy/mobile-transport-runtime | консервативные reservations; не полноценный ORCA/MAPF/сертификация безопасного движения |
| Надёжность | reliability.ts (MTBF/MTTR distributions), stochastic service time distributions | параметры требуют измерений объекта |
| Статистика | experiments + повторяемые seeds + Student-t 95% CI | CI характеризует выбранную модель, не точность физической калибровки |
| Сравнение | simulationCoreStudy.ts: robot vs baseline, одинаковая facility/process/workload | baseline задаётся условной моделью human mobile resources; не «измеренная работа предприятия» |
| Финансы | simulationCoreStudyClient.ts: CAPEX/OPEX/TCO/ROI/NPV/payback с fail-closed при неподтверждённой site geometry | нет реальных коммерческих предложений, налогов, cash-flow ввода, гарантированной окупаемости |
| Trace | trace.ts: entity/task/process/robot/resource события; replay.ts/Scene3D | motion/render не физическая проверка подъёмных механизмов |
| UI | DigitalTwinStudio.tsx, 2D scene editing, 3D replay, проект/экспорт, выбор робота | в основном нет визуального графового конструктора произвольного процесса |
| API | Hono apps/api/app.ts; worker-friendly /simulation-core/status, /simulation-core/study | статус и доступность должны проверяться в конкретном окружении |
| Каталог | data/catalog.json + слои packages/catalog | 44 исследовательских кандидата на текущей проверке, а не обещанные 150+ |
| Облачное развёртывание | wrangler.jsonc и wrangler.preview.jsonc, разные имена Worker | публикация новой feat/material-flow-demo-v1 не подтверждена |
| AnyLogic | cloud.ts, anylogic.ts, Desktop PLE на Windows и локальные .tools prototypes | ни один опубликованный RIS AnyLogic engine с проверенным trace/KPI на этом срезе не подтверждён |

## 2. Новая, но ограниченная функциональность material-flow-demo-v1

Коммит 4c10da9 добавил **заводской двухплечевой процесс**:
- новый preset: «Загрузить производственный цикл»;
- первый входной паллет возникает в точке сырья;
- робот получает задачу и перевозит конкретную единицу к станку;
- станок запускает заданное время обработки (duration);
- если node.properties.transformsLoad=true, входная единица consumed, появляется **новая output единица**;
- возникает следующее transport edge: станок → выход/готовая продукция;
- replay показывает сущности груза с фазами input / loaded / processing / output / delivered;
- события entity.created/loaded/unloaded/processing/consumed/completed происходят из того же DES исполнения; economics завязан на run/experiment.

**Это уже лучше A→B, но не универсальный процессный редактор.** Код factoryFlowDemo.ts жёстко задаёт источник, станок и выход; подобного подтверждённого patient-care или airport luggage pack в HEAD нет. Стеллаж остаётся геометрией без WMS, и это в текущем минимальном ТЗ допустимо. Погрузка/разгрузка пока time abstraction без динамики вил/захвата.

## 3. Свежая проверка на локальном SHA 4c10da9

29.09.2026 реально запущены:
- npm run typecheck — PASS.
- npm run lint — PASS.
- npm test — **208/208 PASS**, 34 файла тестов.
- npm run build — PASS, Vite 8.2.2; предупреждение: lazy Scene3D chunk около 548 KB после минификации, требуется performance review, не runtime error.
- npm run data:verify — PASS: 44 products, 16 families, 8 cases, 40 sources, 163 graph nodes, 155 graph edges, verifiedRaw=0 (не означает, что все страницы источников независимо проверены).

---

# Карта кодовой базы: где искать нужную реализацию
Срез: feat/material-flow-demo-v1 @ 4c10da9. Стек: TypeScript / React 19 / Vite 8 / Hono / Zod / Three.js / Vitest / Playwright / Cloudflare Workers; Node.js 24+.

## 1. Продукт и пользовательский путь
| Путь | Роль |
| --- | --- |
| package.json | npm scripts, workspaces, зависимости |
| apps/web/main.tsx | вход веб-приложения |
| apps/web/Studio.tsx | навигация, каталог, вход в Digital Twin |
| **apps/web/DigitalTwinStudio.tsx** | план, редактор, параметры процесса, запуск, replay, KPI |
| apps/web/Scene3D.tsx | Three.js визуализация роботов и грузов из replay |
| apps/web/digital-twin.css, studio.css | редактор и компоненты UI |
| apps/api/app.ts | Hono маршруты, Simulation Study и AnyLogic, preview middleware |
| apps/api/server.ts | локальный Node сервер |
| wrangler.jsonc / wrangler.preview.jsonc | production и публичный read-only preview |
| scripts/start-ris.mjs | локальный полный запуск |
| tests/e2e/workflow.spec.ts | сквозные desktop/mobile сценарии |
| tests/e2e/preview.spec.ts | публичный read-only boundary |
| .github/workflows/checks.yml | CI |
## 2. Пакет RIS — продуктовые адаптеры (packages/ris)
| Файл | Роль |
| --- | --- |
| contracts.ts | legacy SimulationInput, sector templates и workload |
| scene.ts | импорт и изменение базового layout |
| digitalTwin.ts | старый grid-agv/1.0, сохранить как legacy baseline |
| anylogic.ts | контракт AnyLogic evidence, scene-object types и provenance |
| cloud.ts | AnyLogic Cloud/Open API adapter с fail-closed проверками |
| legacySimulationCoreAdapter.ts | историческая конверсия A→B в v2 |
| simulationCoreAdapter.ts | объекты редактора → FacilityModel v2 |
| **factoryFlowDemo.ts** | новый заводской двухплечевой material-flow preset |
| factoryFlowDemo.test.ts | проверка input→machine→output и cargo identity |
| **simulationCoreReplay.ts** | EventTrace → последовательные кадры робота/груза |
| simulationCoreStudy.ts | baseline-vs-robot runs и повторные эксперименты |
| simulationCoreStudyClient.ts | DTO/ROI/NPV и проверка сопоставимости |
| *.test.ts | тесты схем, демонстрации, replay |
## 3. Simulation Core — универсальный движок (packages/simulation-core)
| Файл | Назначение |
| --- | --- |
| index.ts / contracts.ts / compiler.ts | публичный API и версионированные Zod контракты |
| des.ts | очередность/время событий DES |
| process-graph.ts | граф процесса, вероятностные развилки, rework |
| **process-runtime.ts** | source → service/processing → transport → sink; resource capacities, отказ/простой, cargo lifecycle |
| **mobile-transport-runtime.ts** | назначение роботов, loaded/empty motion, погрузка/разгрузка, traffic, зарядка |
| transport-network.ts | физические маршруты transport-edge |
| navigation.ts / motion.ts | obstacle clearance, маршрут, ускорение/торможение |
| traffic.ts / fleet.ts | reservations, fleets, dispatch |
| energy.ts / charging.ts | Wh, SOC, зарядники/очереди |
| reliability.ts / distribution.ts | MTBF/MTTR и распределения времени операций |
| workload.ts / random.ts | детерминированные arrival streams |
| experiment.ts | Monte-Carlo и Student-t CI |
| runner.ts | reference/test runner |
| **trace.ts** | entity/task/robot/process/resource события + hash/position validation |
| *.test.ts | юнит- и интеграционные инварианты |
## 4. Каталог, импорт, БД, инструменты
| Путь | Назначение |
| --- | --- |
| packages/domain/{models,algebra,event-log,spatial}.ts | базовая бизнес-аналитика, наблюдения и математика |
| packages/catalog/{index,knowledge,matching,privacy}.ts | каталог и подбор |
| packages/importer/{index,table}.ts | табличные импорты |
| data/catalog.json | исследовательские карточки оборудования: сейчас 44 записи |
| data/process-templates.json / knowledge-graph.json | типы процессов и исходные связи |
| data/source-manifest.json / evidence-extracts.json | происхождение фактов, юридические ограничения |
| supabase/migrations/202609050001_platform.sql | organization/scenario/history/RLS |
| scripts/{build-preview,verify-data,verify-database} | сборки и проверки |
| scripts/setup-anylogic-mcp.ps1 / .tools/anylogic-* | ЛОКАЛЬНЫЕ эксперименты с AnyLogic PLE, не production runtime |
| vendor/jaamsim | исследовательские файлы, не основной engine |
| services/simulation/__pycache__ | остатки Python legacy, сами по себе не рабочий backend |
| docs/3d.md, docs/backend.md, docs/deployment.md | предметные эксплуатационные инструкции |
## 5. Ключевой call graph нового factory демонстратора

~~~text
DigitalTwinStudio.tsx
  → factoryFlowDemo.ts → simulationCoreAdapter.ts
  → compiler.ts → process-runtime.ts → process-graph.ts
  → mobile-transport-runtime.ts → transport-network.ts
  → navigation.ts + motion.ts + traffic.ts + energy.ts + charging.ts
  → trace.ts → simulationCoreReplay.ts → Scene3D.tsx
  → simulationCoreStudy.ts → experiment.ts → simulationCoreStudyClient.ts
~~~

Отдельно любые /api/v1/simulation-core/* маршруты проверять в apps/api/app.ts; frontend может вызывать их вместо локального run. Не превращать API-имя в доказательство серверного выполнения без просмотра маршрута.

**ВНИМАНИЕ:** не считать наличие rack, lift, turnRadiusM, buffer в схемах доказательством реализации физических/технологических операций. Смотреть runtime и тесты, особенно fail-closed.
**Нельзя без аудита чистить .tools, node_modules, старые workspaces и чужие кэши:** на предыдущих AnyLogic прогонах почти заполненный диск привёл к зависанию Проводника.

---

# Архитектура симуляции: цель, существующая цепочка, недостающие связки

## 1. Модель мира вместо анимации A→B

Платформа должна оперировать пятью независимыми понятиями:
- **Entity / LoadUnit:** конкретная грузовая или сервисная сущность с ID, типом, массой, размером и текущим состоянием/местом; паллета/контейнер/мобильный стеллаж/тележка, медицинская доставка, аэропортовый багаж.
- **Facility / Location:** план, этаж, препятствия, зоны, станции, доки, зарядки, машины, доступные для передачи места.
- **Process / Job:** входное событие, последовательность операций, вероятностные решения, ожидания, rework, выходы/заказы.
- **Resource:** AMR/AGV, человек, станок, пост контроля, зарядник, дверь, лифт, конвейер; ёмкость, очереди, график, отказы и правила доступа.
- **Evidence:** действия над объектами и ресурсами, наблюдаемый EventTrace, KPI, сравнение альтернатив и финансовые допущения.

**Нет требования симулировать, в какой SKU-ячейке стоит каждая коробка.** Стеллаж может быть только геометрией; если робот забирает стеллаж целиком, нужно типизированное состояние переносимого модуля, точка захвата, ограничения массы/габаритов/проходимости и операция передачи — без обязательного WMS.

## 2. Эталонный целевой цикл производства

~~~text
поступило задание → возник входной поддон/тележка
  → dispatch робота → пустой пробег → подтверждение захвата + load delay
  → loaded motion с переносимым объектом → ожидание/резервирование входного поста
  → выгрузка → освобождение робота → машина выполняет сервис N секунд
  → событие завершения машины → сохранение либо преобразование входной сущности
  → новый выходной поддон/готовая деталь → очередь за следующим роботом
  → loaded delivery к следующему посту или на выход → подтверждение выгрузки
  → результат в EventTrace → KPI → baseline/robot experiment → экономические расчёты
~~~

На HEAD 4c10da9 ограниченный вариант реализован в factoryFlowDemo.ts. **Не утверждать**, что UI позволяет произвольные цепочки, мультиэтажность и перенос любой стойки.

## 3. Действующий контракт симулятора и файловая схема

- simulationScenarioSchema = ris-simulation-scenario/2.
- facilitySchema = ris-facility/2, processSchema = ris-process/1.
- entityType находится в process; отдельный полноценный general Entity catalogue со схемами физических совместимостей ещё не реализован.
- process.nodes: source / transport / process / buffer / sink / inspection / assembly / decision; process.edges: flow / transport и probability.
- Важное: node.kind='buffer' есть в схеме, но process-runtime v4 специально reject unsupported finite buffer occupancy. Не ставить такую вершину в рабочий сценарий без реализации.
- Runtime выбран как simcore-process/4, traceSchema ris-event-trace/1.
- RobotSpec: fleetSize, payloadKg, maxSpeedMps, acceleration/deceleration, turnRadiusM, footprint dimensions, battery, handling times, navigationType.
- FacilityObject: kind, geometry, blocking, capacity, properties, optional reliability.
- Simulation Study: ris-simulation-study/1, роботизированный и baseline варианты одной site/process/workload.
- Доступные trace события: task.*, entity.created/loaded/unloaded/processing/consumed/completed, robot.motion/waiting/charging/failed, resource.requested/reserved/released/failed/repaired, process.started/completed, traffic.conflict/deadlock.
## 4. Где лежит настоящая логика

- Конструктор demo: packages/ris/factoryFlowDemo.ts, функция compileFactoryFlowScenario.
- Исполнение графа: packages/simulation-core/process-runtime.ts, runProcessNetwork.
- Транспортировка: packages/simulation-core/mobile-transport-runtime.ts, MobileTransportRuntime.
- План пути по заданному ребру: packages/simulation-core/transport-network.ts.
- Кинематика/время: navigation.ts + motion.ts; зарядка/энергия traffic.ts/energy.ts/charging.ts.
- Trace validation: packages/simulation-core/trace.ts; cargo replay: packages/ris/simulationCoreReplay.ts.
- Эксперимент: packages/simulation-core/experiment.ts.
- Бизнес-сравнение: packages/ris/simulationCoreStudy.ts и simulationCoreStudyClient.ts.
- Отображение: apps/web/DigitalTwinStudio.tsx и Scene3D.tsx.

Не дописывать движения непосредственно во frontend. Один и тот же run должен давать позиции, состояние груза, выполненные операции, потери времени и итоговые KPIs.

## 5. Конкретные состояния, которые должны стать наблюдаемыми

| Сущность | Минимальные состояния | Где получить доказательство |
| --- | --- | --- |
| Job/Task | created → assigned → active → completed/failed | task events |
| LoadUnit | waiting pickup → attached to robot → at station → processing → output/consumed → delivered | entity events, object/robot IDs |
| Robot | idle → to pickup → loading → transporting → unloading → reposition/charging/failure | robot/process events + position + battery |
| Machine/Post | free → reserved → queue → processing → free/failure/maintenance | process + resource events |
| Dock/charger | free/allocated/waiting/occupied | resource, charging, queue metrics |
| Rack | static obstacle **или** mobile load carrier | object kind + optional semantic attachment |

Каждая операция должна иметь определённую временную метрику. В демонстрации «машина работает» — duration event, а не визуальное мигание.

## 6. Что нужно для реального сценария с несколькими станками и ресурсами

1. Ввести типизированный объект «передаваемый носитель/груз» и способ attachment, не подменяя его SKU-WMS.
2. Дать пользователю прикреплять process node к объекту FacilityModel, задавать service time, capacity, расписание и направление выхода.
3. Дать возможность связывать transport edge из любой станции в другую, выбирать робота и характеристики груза.
4. Реализовать явные запросы станка: machine requests input; при обработке generates output; робот забирает output только после завершения.
5. Привязать ресурсы к настоящим queue/blocking semantics: станок может быть занят, output не может исчезнуть, человек/робот не могут одновременно выполнять несовместимые действия.
6. Для transfers целого мобильного стеллажа: позиция rack изменяется вместе с носителем, collision envelope соответствует load+robot, нет декоративного переноса.
7. Для preview/demo разрешить фиксированный шаблон; для пользовательского production-сценария нужен editor/validator графа и площадки.

## 7. Инварианты качества

- created/completed/in-progress/backlog согласованы по выбранному cut-off; запрет отрицательных счётчиков.
- LoadUnit не может находиться на двух роботах, в двух станках или в двух координатах одновременно.
- Операция сервиса не может завершиться раньше начала плюс подтверждённая duration (с учётом отказа).
- Новый output LoadUnit нельзя доставить до завершения создающей его операции.
- Robotic motion несёт attached load в том же trace; визуальные кадры не придумывают операции, которых не было.
- Один exclusive ресурс не выполняет параллельно больше capacity заявок.
- SOC/charger/energy/traffic сохраняют физические ограничения; infeasible scenario должен вернуть объяснимый отказ, а не бесконечное ожидание.
- Необходимые длина маршрута, обработка, ожидание и charge energy проистекают из модельного времени и параметров; не рассчитываются повторно отдельно в React.
- Finances получают значения только из завершённых экспериментов и измеренных/подтверждённых входных данных.

## 8. Baseline, CI и финансовая интерпретация

simulationCoreStudy.ts строит baseline как другую конфигурацию мобильных ресурсов с той же facility/process/workload. Это **модель допущений**, а не фактический time-motion study. В DTO есть version check, summaries и 95% CI по репликациям. Financial assessment блокируется при неподтверждённой geometry, недостатке репликаций, невыполнении годового плана и неполных денежных вводах.

CAPEX = приобретение robots + integration + infrastructure (на текущей модели).
Annual OPEX = maintenance + energy + residual human costs.
TCO = CAPEX + сумма OPEX по горизонту (простая версия).
NPV дисконтирует annual benefit, ROI простой за горизонт. Не утверждать, что расчёт учитывает налоги, лизинг, коммерческие предложения, установочные простои, все incident/indirect costs.

## 9. Границы внешних движков

AnyLogic/FlexSim может быть внешним model-adapter, только если опубликованная модель принимает идентичную facility/process/robot спецификацию, реально запускается, возвращает из **того же прогона** позиции/события/KPI и разрешена соответствующей лицензией. Локальные AnyLogic PLE .alp prototypes, успешный MCP handshake или HTML animation endpoint этого НЕ доказывают.

OpenTCS/RMF/MAPF/ORCA могут быть fleet-routing/traffic modules; они **не заменяют** DES material flow. Webots/Gazebo — физическая проверка ограниченного числа high-fidelity cases, а не обязательное вычисление каждой Monte-Carlo репликации.

## 10. Контракты публичного compute

RIS Studio → canonical scenario → /api/v1/simulation-core/study → run/replications → DTO with representative robot EventTrace → UI 2D/3D + KPI → financial assessment.
Cloudflare-bound budgets в simulationCoreStudy.ts: maxReplications 30, maxTasks 50 000, maxCyclicTransitionsPerTask 128, maxTransitions 2 000 000, HTTP request 2 MB. Проверить фактическое исполнение на HEAD; эти лимиты обеспечивают bounded request, **не подтверждают** промышленную производительность для произвольного размера завода.

---

# План реализации и незавершённые задачи (work cards)

**Статус:** план, а не сообщение о выполнении. Порядок основан на последних требованиях пользователя и состоянии 4c10da9. Нет утверждённой оценки человеко-часов: сначала оценить входные данные, acceptance, ресурсы и лицензию.

## P0 — пользователь наконец видит работающий процесс, а не A→B

| Карточка | Работа | Acceptance / доказательство |
| --- | --- | --- |
| RIS-MF-001 | Воспроизвести текущий Material Flow v1 из Studio | входной поддон виден на захвате → робот → станок → stop/time → новый выходной поддон → транспорт → sink; EventTrace и метрики из того же run |
| RIS-MF-002 | Проверить и согласовать минимальное целевое ТЗ одного реального производственного объекта | план, 2–3 станции, маршруты, груз, параметры, ресурсы, service times, смена, батарея, реальные ограничения; явно неизвестные поля |
| RIS-MF-003 | Канонический тип LoadUnit/Carrier с параметрами массы, габаритов, attachment и conversion | паллета/контейнер/мобильная стойка двигается с роботом; один владелец, проверяемые события, не нужен SKU inventory |
| RIS-MF-004 | Универсальные семантические станции и handshake | операция input required → request job → robot drop → process start/end → output ready → robot pickup; невозможно забрать output до готовности |
| RIS-MF-005 | Визуальный процессный редактор, не только layout | пользователь собирает source/process/transport/sink, правит duration/capacity/probability, привязывает к точке плана и видит validation |
| RIS-MF-006 | 2–3-станционный заводской acceptance scenario с rework и разными типами грузов | сквозной trace нескольких партий без исчезновения груза, capacity/queues, FEFO/WMS не требовать без причины |
| RIS-MF-007 | Ошибки UI/воспроизводимость: invalid geometry/unreachable station/overweight robot/no charger | понятные fail-closed ошибки, никаких «модель завершена» на неуспешном run, граф и replay не исчезают молча |

Не создавать ещё один демонстрационный режим, который не может быть расширен пользователем. Material Flow v1 должен быть базой для редактора и general ProcessModel.

## P1 — техническая состоятельность движения и загрузки

| Карточка | Работа | Acceptance / доказательство |
| --- | --- | --- |
| RIS-SIM-101 | Safety envelope: учитывать robot footprint + переносимый груз/стойку, несовместимые повороты | трасса не пересекает стены, стойки и другие занятые области даже с грузом |
| RIS-SIM-102 | Несколько одновременных маршрутных задач и intersections | simulation-time reservation, очереди/ожидание/переназначение, отсутствие двойной occupancy |
| RIS-SIM-103 | Устойчивость traffic: deadlock detection/recovery, no-route и low-SOC fallback | невозможный сценарий вызывает понятную ошибку или управляемую policy, не endless loop |
| RIS-SIM-104 | Functional dock/charger resources | ручной ввод capacity; wait, use, release, SOC; charging queue отражается в KPI |
| RIS-SIM-105 | Machines, input/output queues, реальные buffer bounds | finite buffers перестают отвергаться только после тестов на blocking, back-pressure, max WIP |
| RIS-SIM-106 | Reliability/calendar/shift/processing distributions в редакторе | заданные времена/отказы совпадают с EventTrace; сценарий воспроизводим по seed |
| RIS-SIM-107 | Multi-floor doors/lifts только после single-floor readiness | ресурс лифта бронируется и изменяет travel time/queue, нет беспричинного «лифт как стена» |

**Нельзя одновременно объявлять feature available в UI и fail-closed в backend, не объяснив ограничения.**

## P1 — реальные сценарии медицины и аэропорта

| Карточка | Работа | Acceptance / доказательство |
| --- | --- | --- |
| RIS-MED-201 | Выбрать узкую медицинскую операцию (питание/бельё/расходники/доставка препаратов) | классифицированные задания, точка выдачи, recipient handover, service time, этажи/двери, часы и KPI |
| RIS-MED-202 | Материальные потоки и персонал | у медробота есть entity и задача; охват выполняемой работы, запрет ложных выводов о результате лечения |
| RIS-AIR-203 | Сформулировать airport MVP c пользователем | выбрать конкретно baggage transfer/логистику технических грузов/питание, границы landside/airside |
| RIS-AIR-204 | Специализированный процесс pack | time windows, screening/sortation/handover только где подтверждено; не выдавать аэропортовый общий A→B за airport operations |
| RIS-UNI-205 | Общий сценарный контракт | один Simulation Core, разные domain templates; identical trace/KPI schemas и dispatch |

Отраслевые packs не должны становиться отдельными копиями simulation engine.

## P2 — входные данные, каталог, оптимизация

| Карточка | Работа | Acceptance / доказательство |
| --- | --- | --- |
| RIS-IMP-301 | Масштабирование + трассировка PNG/JPG/WebP | пользователь подтверждает масштаб, стены, пути и точки до run/ROI |
| RIS-IMP-302 | Векторный PDF/DXF при наличии подходящей библиотеки | разобранная геометрия, слои/единицы измерения, явная верификация; DWG/BIM не обещать без отдельной лицензии |
| RIS-CAT-303 | Расширить каталог до требуемых 150+ реальных позиций | паспортные данные/поставщик/происхождение/дата, не смешивать robotics и generic automation, не выдумывать цены |
| RIS-CAT-304 | Подбор по payload/width/footprint/turning/power/compatibility | incompatible equipment не участвует в run и ROI |
| RIS-OPT-305 | Fleet sizing/dispatch/charging optimization (OR-Tools или аналог) | baseline vs optimized policy на одинаковых seeds; KPI improvements без искусственной анимации |
| RIS-ENG-306 | Несколько compute adapters только при proof/use-case | benchmark native vs external on fixed cases, explicit licenses and operating costs |

## P2 — доказуемость экономики и production SaaS

| Карточка | Работа | Acceptance / доказательство |
| --- | --- | --- |
| RIS-FIN-401 | Полный input provenance: цены, обслуживание, труд, энергия, интеграция, ввод в строй | если исходных данных нет, UI явно показывает допущение и блокирует «точную окупаемость» |
| RIS-FIN-402 | Sensitivity + uncertainty: парк, такт, спрос, failure, costing | comparative plots from same input/seed sets, confidence bounds, feasibility gates |
| RIS-FIN-403 | Рендерированный отчёт для директора/инженера | план/сценарий, видео/снимок трассы, KPI distributions, CAPEX/OPEX/TCO/ROI/NPV, допущения, рекомендации по валидации |
| RIS-SAAS-404 | Сохранение/версионирование проектов, роли, аудит | Supabase/RLS live tests, Google Auth, import/export, backups/restore, zero cross-tenant reads |
| RIS-SAAS-405 | Платформенные limits/async runs/progress/cancel | quotas/abuse controls, bounded memory/time, reliable job status, no Worker timeouts |
| RIS-SAAS-406 | Monitoring/SLO/alerts/error budgets | production observability, replay/trace retention, rate limiting and incident playbook |

## P3 — профессиональные движки и верификация

| Карточка | Работа | Acceptance / доказательство |
| --- | --- | --- |
| RIS-VAL-501 | Аналитический oracle для простых трасс и узких мест | known-answer case, mass-conservation/time/resource exclusivity |
| RIS-VAL-502 | Сверка с подтверждённым AnyLogic/JaamSim/RAWSim-O сценарием | единая геометрия, распределения и robots; вывод различий/ограничений, без «паритета по умолчанию» |
| RIS-VAL-503 | AnyLogic Cloud backend по реальному контракту, если лицензия/модель доступны | опубликованная модель, inspect inputs/outputs, live run, event trace+KPI, корректная лицензия |
| RIS-VAL-504 | High-fidelity physical check ограниченных конфликтных случаев (Webots/Gazebo) | matched kinematics/footprints, benchmark cases, не дорогостоящий постоянный runtime |
| RIS-VAL-505 | Исследование 100 аналогов: инвентарь use cases и legal/API embed-constraints | 100 проверяемых уникальных названий/версий/лицензий/документаций, таблица требований, proof ссылками; пока задача открыта |

## Зависимости / последовательность

~~~text
Сначала: воспроизведение 4c10da9 → целевой демонстрационный процесс → Entity/Carrier/Station semantics
       → редактор графа → 2–3 станка + очереди + груз → footprint loaded traffic
       → медицинский pack + airport pack → validation/benchmark → finance calibration
Параллельно: catalogue/source audit, image calibration, supabase/auth review, research 100 analogs.
~~~

**Stop conditions:** если baseline/robot runs используют разные workloads; trace не соответствует KPI; груз пропадает/дублируется; route невозможен; ROI разблокировался на template geometry; runtime browser красный — релиз заблокировать.

## Приёмка одного work card

1. Точно указать входной scenario и expected physical process.
2. RED test воспроизводит проблему.
3. Изменение только owning module/interface, никаких незапрошенных переписываний.
4. GREEN: unit/contract/integration + relevant Playwright desktop/mobile.
5. Отдельный review correctness/security/performance; сравнение результатов до/после.
6. Версионированный EventTrace и data provenance; export если изменились contracts.
7. git commit/push на отдельную ветку → CI на том же SHA → runtime public smoke только после deploy.
8. Обновить страницу handoff с SHA, доказательствами и оставшимися ограничениями.

---

# Тестирование, локальный запуск, GitHub и Cloudflare

**Эта инструкция не означает новый deploy**. Состояние подтверждать на exact commit SHA. Node.js 24+, Hono/React/Vite/Cloudflare Workers. Локальная машина: C:\Users\Pavel kit\workspace\robot-investment-review.

## 1. Запуск

~~~powershell
cd "C:\Users\Pavel kit\workspace\robot-investment-review"
git status --short
git branch --show-current
git rev-parse HEAD
npm ci
npm run start:full
~~~

По умолчанию start-ris.mjs публикует приложение на http://127.0.0.1:8890. Если порт занят устаревшим Vite/Node, найти владельца процесса или выбрать новый порт. Не выдавать открытую старую вкладку за текущую сборку. Python/Java для базового запуска Simulation Core v4 не требуются.

## 2. Quality gate

~~~powershell
npm run typecheck
npm run lint
npm test
npm run data:verify
npm run build
~~~

**Свежее доказательство на 4c10da9 (29.09.2026):** typecheck PASS, lint PASS, Vitest 208/208 PASS в 34 test files, build PASS. data:verify PASS: 44 products, 16 families, 8 cases, 40 sources (verifiedRaw=0 означает отсутствие локально подтверждённого полного raw corpus, не ноль product entries). Build предупреждает о Scene3D chunk ~548 KB; оптимизация bundle — отдельная задача.

### E2E workflow

~~~powershell
# Терминал A:
npm run start:full
# Терминал B:
$env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:8890"
npx playwright test tests/e2e/workflow.spec.ts --reporter=list
# Заводской пользовательский сценарий:
npx playwright test tests/e2e/workflow.spec.ts -g "production cycle:" --reporter=list
~~~

**На момент handoff E2E на 4c10da9 заново не выполнены.** В репозитории есть тесты factory material flow desktop/mobile, но наличие файла != текущий PASS. При двух одновременных Playwright процессах ранее встречался shared test-results race/ENOENT; запускать последовательным порядком либо развести output dirs.

### Read-only preview

~~~powershell
npm run build:preview
$env:PUBLIC_PREVIEW_MODE="true"
$env:PORT="8978"
npm start
# В другом терминале:
$env:RIS_PREVIEW_TEST="true"
$env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:8978"
npx playwright test tests/e2e/preview.spec.ts --reporter=list
~~~

Preview не должен раскрывать серверный compute, AnyLogic secrets, кабинет и мутирующие API. Серверные запрещённые вызовы должны вернуть PREVIEW_READ_ONLY; браузерный JS preview не эквивалентен платному серверному execution.

## 3. API и compute limits

В apps/api/app.ts проверить актуальные пути и payload. Предыдущий деплой поддерживал /api/v1/health, /config, /catalog, /simulation-core/status, POST /simulation-core/study; AnyLogic /ris/cloud/status, inspect, run отдельно и fail-closed. Статус GET /api/v1/simulation-core/status возвращал engine simcore-process/4.

Study budget по simulationCoreStudy.ts: maxReplications 30, maxTasks 50 000, maxCyclicTransitionsPerTask 128, maxTransitions 2 000 000; request body 2 MB. Эти ограничения предотвращают некоторые избыточные запросы, но не являются нагрузочным испытанием.

## 4. Развёртывание Cloudflare — две цели

| Окружение | Конфигурация | URL |
| --- | --- | --- |
| Production | wrangler.jsonc / robotization-platform | https://robotization-platform.battle-walleye.workers.dev |
| Read-only preview | wrangler.preview.jsonc / ris-public-preview | https://ris-public-preview.battle-walleye.workers.dev |

Исторически правильный аккаунт, где были оба Worker — Battle Walleye. На 29.09 HTTP GET статуса public production подтверждал simcore-process/4, **но наличие material-flow коммита 4c10da9 в этом deploy не доказано**. Историческая версия production 1ed22367-49ef-4af2-b674-121ac853d0bd и preview 8a63885e-c8ce-4777-8c1d-20cc5a0f76a4 относились к более старому релизу. Перепроверить deployment history и commit identification.

~~~powershell
npx wrangler whoami
npx wrangler deployments list -c wrangler.jsonc
npx wrangler deployments list -c wrangler.preview.jsonc
npm run build
npx wrangler deploy -c wrangler.jsonc
npm run build:preview
npx wrangler deploy -c wrangler.preview.jsonc
~~~

Деплоить только после подтверждения аккаунта, правильной ветки/commit, полного CI/E2E и разрешения на релиз; git push сам сайт НЕ обновляет.

## 5. GitHub/PR стратегия

Origin: https://github.com/CrazyEther/robotization-platform .
- Новый material-flow: origin/feat/material-flow-demo-v1 @ 4c10da9.
- Предыдущий Simulation Core: feat/simcore-v2-foundation @ 0270e70, PR #4 к feat/anylogic-scene-workspace, открыт и не merged на срезе.
- main — отдельная старая ветка. Не сливать ветки без анализа merge-base и конфликтов.
- Проверки старого PR (202 tests, Actions Checks #78) нельзя считать доказательством нового material-flow коммита (208 tests на локальном SHA).

## 6. База, авторизация и безопасность

- Supabase/PostgreSQL миграция: supabase/migrations/202609050001_platform.sql.
- docs/backend.md и docs/deployment.md описывают организации, роли owner/editor/viewer, RLS, history, invites и импорт. Облачные auth, RLS, backup/restore **требуют live verification**.
- Никаких service-role key, API tokens, .env, cookies и личных данных в логах, handoff или Git.
- Публичный read-only Worker изолирован от mutable APIs, а внешние AnyLogic credentials должны оставаться server-side.
- Проверьте performance, quotas, rate/abuse protection, input validation и наблюдаемость до промышленных обещаний.

## 7. Прошлые сбои Windows/AnyLogic

Много временных AnyLogic workspaces и одновременно запущенные Java/Chrome привели к почти полному диску C: и зависанию Windows Explorer. Пользователь подтвердил восстановление после остановки идентифицированных процессов; не очищать .tools и чужие директории автоматически.

Из прошлых логов:
- root.wait: Argument agent is null — ошибочное освобождение null agent в Wait.free().
- NoClassDefFoundError Main$63 / generic TransporterFleet compilation errors — проблема сгенерированных Java моделей.
- IProject.getLocation() null — workspace Eclipse/AnyLogic.
- chromium-win64/chrome.exe not found — вспомогательная проблема browser-launcher, не всегда ошибка DES.

Их исправление не эквивалентно опубликованному AnyLogic Cloud backend. Для нового запуска требуется отдельный открытие → компиляция → actual run → trace/KPI → RIS evidence gate.

## 8. Release acceptance

Проверить не только green pipeline, но и смысл:
- Новый груз действительно едет на роботе, выгружается, ждёт сервис, из обработки появляется корректный output, затем доставляется.
- Машина/станция, очередь, charging, traffic определяют реальное модельное время и бизнес-результат.
- Несовместимая геометрия/робот/задача ошибку не маскируют.
- Demo-геометрия не открывает verified ROI.
- Фактический public URL и deployed SHA совпадают с проверенным и задокументированным.

---

# Аналоги, готовые движки и исследовательский backlog

**Статус:** перечень кандидатов из предыдущих исследовательских обсуждений, **не исчерпывающий отчёт о 100 проверенных продуктах**. Для закупки/встраивания потребуются свежая документация, license review, API proof и пилот. Подробный отраслевой research corpus проекта — docs/research-report.md, data/catalog.json, data/source-manifest.json.

## 1. Категории: не сравнивать «всё с AnyLogic» одним рейтингом

| Роль в нашей системе | Кандидаты | Для чего потенциально полезны | Ограничение |
| --- | --- | --- | --- |
| Общий discrete event simulation | AnyLogic, FlexSim, JaamSim, SimPy, FactorySimPy | объекты, ресурсы, очереди, технологические операции | не каждый движок встроится в web Worker / коммерческий SaaS |
| Граф мобильных роботов и диспетчеризация | openTCS, Open-RMF, ROS 2 fleet adapters | assignment, reservations, двери/лифты, fleet interoperability | fleet manager не моделирует весь материальный процесс |
| Глобальная навигация | Recast/Detour, OMPL, grid/visibility planners | физически допустимые маршруты и footprint | не моделируют спрос, станки, CAPEX и ROI |
| Конфликты многих роботов | libMultiRobotPlanning (CBS/SIPP/ECBS), ORCA/RVO2 | пространства-время, avoiding/conflict resolution | сложный integration/runtime и real-time proof |
| Планирование ресурсов | Google OR-Tools | assignment/scheduling/charging/fleet sizing | optimizer не заменяет симуляцию |
| Высокоточная робототехника | Gazebo, Webots, ROS 2, Isaac Sim | кинематика/сенсоры/контроллеры/бенчмарки | избыточны для тысячи экономических Monte-Carlo runs |
| Warehouse-specific benchmark | RAWSim-O, специализированные AS/RS симуляторы | RMFS, batching, rack/service bottlenecks | licence/open-source scope и предметные допущения |
| Industrial software | Visual Components, Siemens Plant Simulation, Simio, DELMIA, WITNESS, Arena и др. | профессиональные процесcные библиотеки и UI refs | лицензия/сервер/API/облачный режим — уточнять |
| Предметный аэропорт/healthcare | AirTOP, FlexSim Healthcare, RMF clinic/airport demos | отраслевые модели и ограничения | не копировать чужие сценарии без переосмысления и прав |

## 2. Что уже есть в коде, что не нужно писать заново

- packages/simulation-core/des.ts — свой TypeScript DES scheduler.
- process-graph.ts/process-runtime.ts — рабочие узлы source/process/decision/sink, resource queues и перевалка.
- mobile-transport-runtime.ts/traffic.ts/energy.ts/charging.ts — транспорт, ресурсы, battery.
- navigation.ts/motion.ts/transport-network.ts — базовое построение пути и времени, часть физической модели.
- experiment.ts — репликации и интервалы.
- Для минимального material-flow MVP **не требуется** сразу ставить AnyLogic/OpenRMF/SimPy/Recast одновременно.

Главный незакрытый пользовательский разрыв — **описание и редактирование реальной цепочки обработки и состояния груза**, а не отсутствие ещё одной библиотеки pathfinding.

## 3. AnyLogic — урок предыдущего подхода

На Windows установлен AnyLogic 8.9 Personal Learning Edition. Пакет RIS пытались строить из official demo Transporters Moving in Free Space/Material Handling, генерировать .alp через собственный Python generator и сторонний anylogicPLE-mcp. Получены открытия прототипов и отдельные runs, но неоднократно появлялись root.wait(null), Main$63/compile errors, повреждения workspace, ошибки web host/animation.

**Не утверждать**, что Desktop PLE автоматически предоставляет production коммерческую лицензию, облачный API и право публичного хостинга. Проверять условия у поставщика. Доступ к AnyLogic Online != автоматически AnyLogic Cloud REST. Параметры published model, контракт risTraceJson/risKpisJson и возможность интеграции должны быть проверены на живом опубликованном моделировании; в текущем коде это только fail-closed adapter.

Материалы: docs/anylogic-mcp.md, packages/ris/cloud.ts, packages/ris/anylogic.ts, tests/anylogic-cloud.test.ts, .tools/anylogic-* (много локальных кэшей; не чистить без аудита).

## 4. Инженерное правило выбора библиотеки

Для любой новой зависимости сначала отвечать:
1. Какое конкретное требование из 01_PRODUCT_REQUIREMENTS.md она покрывает лучше существующего кода?
2. Есть ли поддерживаемый CLI/server/API или только GUI?
3. Поддерживает ли запуск без графической среды, Windows/Cloudflare/выделенный worker?
4. Лицензия, коммерческий хостинг, перераспространение, version pinning?
5. Есть ли map/material-flow adapters и воспроизводимый reference test?
6. Какую точность даст относительно реальных данных объекта и как измерять ошибку?
7. Может ли модуль быть optional adapter, не ломая сценарий/финансовые контракты?
8. Что надо сохранить в trace/metrics для независимой валидации?

Без proof не добавлять библиотеку «для галочки».

## 5. Где доступные готовые решения реально полезны

- **Первые производственные циклы:** оставлять текущий DES и доделывать entity lifecycle + station handshake + editable process graph; иначе импорт внешней системы не решит отсутствующую семантику.
- **Навигация с сложными стенами и радиусами:** benchmark текущего visibility planner против Recast/Detour/OMPL с одним и тем же loaded footprint.
- **Много AMR в узких проходах:** benchmark reservations против SIPP/CBS/MAPF, ORCA только как local avoidance, не global dispatcher.
- **AGV по фиксированной сети:** рассмотреть openTCS Adapter после проверки licence/API/operational model.
- **Двери/лифты/смешанные флоты:** Open-RMF Adapter после появления собственных функциональных door/lift resources.
- **Оптимизация числа роботов и зарядок:** OR-Tools поверх исполнителя DES и comparative experiments.
- **Физическая верификация:** 1–3 benchmark scenarios в Gazebo/Webots/AnyLogic/JaamSim, не запуск всей финансовой модели по дорогой 3D физике.

## 6. Отраслевые особенности исследования

| Сектор | Что изучать в первую очередь |
| --- | --- |
| Производство | вход/выход machine tending, такт, остановки, межоперационная передача и захват носителя |
| Склад | pallet move / goods-to-person / AMR-assisted handover, docking, bottlenecks, ручной сбор если нужен |
| Клиника | patient service scope, nurse assistance versus medication/food transport, hygiene, допустимые маршруты и handover |
| Аэропорт | выбрать baggage/airside/landside подоперацию, conveyor/inspection/gate time windows |
| Фармацевтика | партии, температурный режим, ограничения обращения, critical delivery windows; только при подтверждённых данных |

Универсальный движок должен иметь общий Resource+Entity+Process API, а не один доменный хардкод. Склады — возможный benchmark, не ограничение продукта.

## 7. Задача «100 аналогов» — открыта

Пользователь ранее просил исследовать 100 аналогов. В текущем каталоге **44 оборудования из 16 семейств**, а не 100 проверенных симуляторов. Не подменять «44 робота/продукта» «100 программами». Если возвращаться к исследованию, хранить таблицу:
- unique name/version/vendor, класс продукта, URL официальной документации, release date;
- kind: DES/process, navigation, fleet, robotics physics, healthcare, airport, finance, ROI;
- feature mapping: Facility Editor, jobs, queues, cargo identity, service, route, multi-robot, charge, failures, experiments, economy;
- API/CLI/headless/cloud capabilities, open-source/commercial licence, server embed proof, model export/import, actual scenario demo, active maintenance;
- статус **verified / official claim / untested / unavailable**, источник, дата и условия встраивания.
Пока нет такой проверенной таблицы — не писать «100 аналогов изучены».

## 8. Ссылка на источники внутри проекта

- docs/research-report.md (исследовательский срез 05.09.2026);
- docs/reference-acceptance-matrix.md и simulation-adapters.md (старые, несовместимые с новейшим material-flow без апдейта);
- data/source-manifest.json, data/evidence-extracts.json, data/knowledge-graph.json;
- docs/anylogic-mcp.md и tests/anylogic-cloud.test.ts;
- сам код и активная ветка имеют приоритет над старыми документами о реализации.

---

# Handoff contract: решения, доказательства, блокеры, следующая работа

## 1. Resumption state

**Цель:** передать рабочий проект следующему разработчику/ИИ без воспроизведения длинного диалога и без повторения старых ошибочных архитектурных действий.

- Repo: CrazyEther/robotization-platform.
- Локальный корень: C:\Users\Pavel kit\workspace\robot-investment-review.
- Проверенная активная ветка: feat/material-flow-demo-v1.
- Проверенный HEAD: 4c10da97aaa94cf27f5ae0da588fc39bd6200215 (28 сентября, материал flow demo).
- При проверке до записи этих handoff файлов git status был **clean**; после создания данного пакета docs/handoff/ станет намеренно dirty, пока его не закоммитят.
- Origin material-flow branch существовал на том же SHA; PR для нового material-flow не подтверждён.
- Parent foundation branch feat/simcore-v2-foundation @ 0270e70; PR #4 открыт, **не merged**.
- Production и preview URL известны, но свежий deploy material-flow HEAD **не доказан**.
- Новые файлы в docs/handoff/** — намеренное изменение для передачи, не изменение runtime.

## 2. Какова первая реально безопасная следующая задача

**Воспроизвести Material Flow v1 как пользователь, затем дать функциональную оценку, а не дописывать новую математику по предположению.**

1. На рабочем SHA открыть docs/material-flow-v1.md и factoryFlowDemo.ts.
2. Запустить Studio на отдельном порту; выбрать «Загрузить производственный цикл».
3. Увидеть траекторию входной единицы, погрузку, перевозку, разгрузку на станке, обработку, consumed input/created output, вторую перевозку и завершение; убедиться, что user-facing replay соответствует числам.
4. Проверить, что station processingSeconds действительно влияет на waits/throughput и financial assessment.
5. Запустить целевые factoryFlowDemo.test.ts и production-cycle E2E, записать SHA, фактическую ошибку/результат.
6. Показать пользователю **скриншот из реальной среды** и список явных несоответствий. НЕ утверждать, что скриншот существует, без проверенного файла/ссылки.
7. После воспроизведения и принятия направления начать RIS-MF-003/004/005 из 05_ROADMAP_BACKLOG.md.

Почему такой порядок: пользователь уже прямо сказал, что имеющаяся A→B анимация его не устраивает и просит **реальное взаимодействие груза/робота/станка**. Новая реализация пока демонстрационная и должна пройти визуальную/функциональную приёмку.

## 3. Архитектурные решения, которые сохранять

- Не переписывать сайт целиком. Сохранять UI, каталог, импорт, финансы, авторизацию, persistence-контуры — менять владение simulation semantics.
- Универсальное ядро: Facility + Process + Resource + LoadUnit + Workload + EventTrace. Отрасль как шаблон/адаптер, не отдельная копия движка.
- Работающая производственная вертикаль — **первый proof**, а не определение всего продукта.
- Стеллаж не обязан содержать сотни SKU-ячееек. Для транспортировки целой стойки требуется carrier semantics, габариты и docking. Статический стеллаж может быть препятствием, если не участвует в процессе.
- Внешний AnyLogic/FlexSim/OpenRMF/etc — опциональные engine-specific adapters/benchmarks; не основной источник физики/финансов без работающего runtime и лицензии.
- 2D/3D визуализация **только из EventTrace**; fake path и независимый UI route запрещены.
- Расчёт ROI привязывать к результатам одинаковой нагрузки baseline/robot и проверенным денежным входам; шаблонная геометрия/недостаток evidence блокируют вывод.
- Сохранить legacy grid-agv/1.0 для сравнения/воспроизводимости; не развивать как единственный production сценарий.
- Любой новый domain pack обязан переиспользовать тот же engine.
- Жёсткий принцип: **физически невозможный сценарий fail-closed**, даже если тест или демонстрация хотят получить красивый кадр.

## 4. Доказательства и устаревшие свидетельства

| Факт / утверждение | Основание | Свежесть/статус |
| --- | --- | --- |
| Текущий SHA 4c10da9, clean до документации | git status, branch, log | проверено 29.09.2026 |
| Новый заводской двухплечевой process c entity events | factoryFlowDemo.ts, process-runtime.ts, trace.ts, replay.ts | проверено чтением на 4c10da9 |
| 208 unit/integration tests | npm test, 34 files | PASS на 4c10da9 |
| typecheck, lint, Vite build | запуск npm scripts | PASS на 4c10da9 |
| data/catalog имеет 44 products/16 families/8 cases | npm run data:verify | PASS на 4c10da9 |
| Полный E2E factory material-flow на 4c10da9 | tests/e2e/workflow.spec.ts существует | **NOT CHECKED в этом срезе** |
| Production исполняет Simulation Core v4 | HTTP GET live status | наблюдалось 29.09.2026 |
| Production уже содержит factory material flow 4c10da9 | deployment/HTTP/browser на том SHA | **NOT CHECKED** |
| PR #4 является material-flow PR | GitHub PR metadata | **Нет:** PR #4 head 0270e70, не material-flow |
| AnyLogic Cloud публикует RIS модель | реальный model/trace/ROI proof | **не подтверждено** |
| Любой сектор допускает произвольные процессы из UI | hard-coded factoryFlowDemo.ts + секторы | **не реализовано/не доказано** |
| 100 аналогов исследованы и пригодны для встраивания | отдельная таблица/доказательства | **не выполнено** |
| Полный production multi-tenant SaaS работает | RLS/cloud OAuth/backup live tests | **не доказано** |

## 5. Отрицательный опыт — не повторять

- Исходный «симулятор» A→B оценивался как законченный только потому, что шевелились роботы и были метрики. Это пользователь отверг. Настоящая цель — материальный/сервисный процесс.
- Стеллажи просто как blocking rectangles нельзя выдавать за функциональную складскую симуляцию. Но и разработка WMS адресации без требования пользователя — неоправданный scope drift.
- В AnyLogic неоднократно исправлялась одна и та же ошибка Wait.free(null), создавались новые workspaces, а реального стабильного опубликованного pipeline не было. Нужно проверять Java runtime и compilation отдельно, не запускать массовые прогоны и не обещать интеграцию по наличию .alp.
- Избыточные AnyLogic/Java/Chrome процессы и заполнение диска привели к проблемам Windows Explorer. Сохранять ресурсы пользователя.
- Многократно приводились зелёные **unit** тесты при отсутствии реального user-scenario acceptance. Отделять математическое unit coverage от физической валидности и реальной UX работоспособности.
- Обещание «сайт обновлён» без публичного smoke на конкретном SHA и запрет выдавать неподтверждённый sandbox image link.
- В истории попытка одновременно использовать SimPy/JaamSim/OpenRMF/AnyLogic/Gazebo не породила рабочий сквозной материальный процесс; сначала bounded vertical slice, затем интеграция готовых компонентов там, где нужна.

## 6. Текущие блокеры/неопределённость

1. **Бизнес-данные реального пилота отсутствуют**: plan scale, размеры мобильного стеллажа/поддона, параметры оборудования, time study, demand distribution, стоимость.
2. **Общий Process Graph Editor отсутствует**: доступные процессные capabilities скрыты за hard-coded templates.
3. **Точность движения при loaded footprint/динамике не калибрована**; current reservations conservative; lift/door resources и finite buffers ограничены.
4. **Медицинские и аэропортовые сценарии недоопределены**, особенно patient-care и airport security/airside.
5. **AnyLogic коммерческая инфраструктура не подтверждена**, PLE licence и Cloud API не считать решёнными.
6. **Релиз 4c10da9 на Cloudflare не подтверждён**; CI/new PR и публичный smoke требуются.
7. **Каталог 150+ не достигнут** в подтверждённых данных: 44 current records.
8. **Облачные auth/RLS/OAuth/backup** и нагрузочная проверка Worker — отдельные production gates.

## 7. Если работа прерывается на текущем этапе

Записать в этот файл:
- SHA, branch, git status и имена изменённых файлов, включая те, которые нельзя трогать;
- точную команду воспроизведения/тест и результат, без подмены NOT_CHECKED на PASS;
- что конкретно видит пользователь в кадрах и какие cargo/resource событийные связи подтверждены;
- deployed Worker version + URL, только после реального подтверждения;
- любые ошибки и причины, включая false leads;
- **первое безопасное действие следующего сеанса**, не расплывчатое «продолжить».

## 8. Защита рабочего дерева

Нельзя: без согласования удалять .tools, чужие каталоги, AnyLogic workspaces, git refs, незакоммиченные изменения, пользовательские проекты и credentials.
Документация handoff не должна менять рабочий runtime, не должна публиковать секреты. Для CI на ветке после коммита handoff требуются те же проверки; тесты на 4c10da9 считаются старыми относительно нового docs-commit, хотя runtime при нём не изменён.

## 9. Честный конечный результат

Не «сделан AnyLogic». Конечный результат — **системно протестированная, предметно достоверная специализированная симуляция роботизации**, которую руководитель/инженер может проверить, в которой реальные процессы, роботы, грузы и ограничения отражены в выполнении и ROI, а ограничения и источник каждого числа понятны.

При этом будущий исполнитель обязан дописать и проверить недостающий пользовательский flow, а не переписывать всё, что уже работает.
