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
