# Robot Investment Studio — передача разработки

**Актуальный пакет handoff:** [docs/handoff/00_START_HERE.md](docs/handoff/00_START_HERE.md).
**Единый файл для передачи другой ИИ-модели:** [PROJECT_HANDOFF_ALL.md](PROJECT_HANDOFF_ALL.md) — все девять разделов подряд.
Дата: 29 сентября 2026 года; ветка материала-flow: feat/material-flow-demo-v1 (runtime-base 4c10da9 до добавления документации).

| Файл | Что содержит |
| --- | --- |
| [00_START_HERE.md](docs/handoff/00_START_HERE.md) | точка входа, SHA/ветка и первое безопасное действие |
| [01_PRODUCT_REQUIREMENTS.md](docs/handoff/01_PRODUCT_REQUIREMENTS.md) | оригинальное ТЗ + последние явные требования пользователя |
| [02_CURRENT_STATE_EVIDENCE.md](docs/handoff/02_CURRENT_STATE_EVIDENCE.md) | что реально сделано, тесты, деплой и подтверждённые ограничения |
| [03_CODEBASE_MAP.md](docs/handoff/03_CODEBASE_MAP.md) | пути файлов и карта runtime/UI/API/test/data |
| [04_SIMULATION_ARCHITECTURE.md](docs/handoff/04_SIMULATION_ARCHITECTURE.md) | объект/груз/машина/процесс, DES→EventTrace→KPI→экономика |
| [05_ROADMAP_BACKLOG.md](docs/handoff/05_ROADMAP_BACKLOG.md) | P0/P1/P2/P3 work cards и критерии приёмки |
| [06_TESTING_DEPLOYMENT.md](docs/handoff/06_TESTING_DEPLOYMENT.md) | локальный запуск, CI, Cloudflare, безопасность |
| [07_ANALOGS_AND_RESEARCH.md](docs/handoff/07_ANALOGS_AND_RESEARCH.md) | готовые программные аналоги/адаптеры и невыполненное исследование 100 решений |
| [08_HANDOFF_DECISIONS_RISKS.md](docs/handoff/08_HANDOFF_DECISIONS_RISKS.md) | решения, системные ошибки, неопределённости и resumption contract |

**Ключевая граница:** основной изначальный A→B demo не удовлетворяет пользователю. Новый ограниченный factory material-flow пример моделирует входную грузовую единицу, передачу станку, timed processing, выходную единицу и вторую доставку. Это **не означает** готовность универсального графового редактора или AnyLogic-подобной модели; не утверждать, что новый коммит опубликован на Cloudflare без новой проверки.

Некоторые прежние README.md / CURRENT_TICKET.md / docs/simulation-adapters.md описывают старые этапы. Для актуального контекста начинать с настоящего handoff, затем перепроверять исходники и git status.
