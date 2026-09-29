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
