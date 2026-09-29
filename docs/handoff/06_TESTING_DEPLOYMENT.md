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
