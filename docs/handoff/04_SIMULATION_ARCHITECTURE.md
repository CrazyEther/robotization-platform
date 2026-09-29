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
