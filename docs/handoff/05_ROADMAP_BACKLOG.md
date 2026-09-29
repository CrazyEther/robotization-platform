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
