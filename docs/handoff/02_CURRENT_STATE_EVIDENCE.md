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
