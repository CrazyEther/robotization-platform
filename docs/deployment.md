# Развёртывание

## Приложение

Node.js 24+: `npm ci`, `npm run build`, `npm start`. Адрес: http://127.0.0.1:8787. Режим разработки: `npm run dev`.

## PostgreSQL и авторизация

Для локального Supabase требуется Docker. Запустите `npm run db:start`, затем `npx supabase migration up --local`. API использует порт 25421, PostgreSQL — 25422. Локальный вход по email включён для проверки авторизации; облачные настройки провайдеров задаются отдельно.

Скопируйте `.env.example` в `.env` и укажите SUPABASE_URL и SUPABASE_ANON_KEY. Не добавляйте service-role ключ в приложение или репозиторий.

В облачном Supabase примените миграции и включите Google provider. Настройте Google client ID/secret, callback Supabase и точные адреса перенаправления опубликованного сайта. После настройки установите GOOGLE_OAUTH_ENABLED=true.

Проверьте вход, выход, приглашения, роли owner/editor/viewer и изоляцию организаций на опубликованном адресе.

## Cloudflare Workers

```sh
npx wrangler login
npm run build
npm run deploy
```

В настройках Worker задайте SUPABASE_URL, SUPABASE_ANON_KEY и GOOGLE_OAUTH_ENABLED. Не используйте service-role ключ. Настройки проекта находятся в `wrangler.jsonc`.

## Проверки и восстановление

Перед обновлением выполните typecheck, lint, test, data:verify, build и браузерные тесты. GitHub Actions повторяет проверки на Linux.

`npx tsx scripts/verify-database.ts --restore` проверяет локальные роли, историю, приглашения и восстановление логической копии public/auth в отдельную временную БД. Скрипт не работает с внешним Supabase. Он не заменяет регламент резервирования облачного окружения: проверяйте хранение резервных копий, роли сервера и восстановление на отдельном стенде до эксплуатации.
