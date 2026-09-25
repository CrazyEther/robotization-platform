# Cloudflare public preview

Preview URL: https://ris-public-preview.battle-walleye.workers.dev

The preview Worker is isolated from the production-name Worker and uses `PUBLIC_PREVIEW_MODE=true`.

## What is available

The RIS Digital Twin runtime is browser-side JavaScript, so a visitor can:
- choose an object and transport robot;
- edit a facility scene;
- execute the local Digital Twin;
- replay the computed trajectories in 2D/3D;
- compare baseline vs robot and experiment with financial inputs.

This browser computation is not a Cloudflare compute backend and does not consume a secret simulation service.

## What remains server-blocked

Preview middleware permits only safe informational GET endpoints (`health`, `config`, `catalog`). All server-side writes and protected services return `503 PREVIEW_READ_ONLY`, including:
- organizations/accounts/project persistence;
- imports and mutations;
- AnyLogic inspect/run;
- other protected server calculations.

No AnyLogic API key, Supabase secret or other private credential is bundled into the preview.

Static preview responses carry `X-Robots-Tag: noindex, nofollow, noarchive`.

## Verification

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run data:verify
npm run build:preview
```

Local preview:

```powershell
$env:PUBLIC_PREVIEW_MODE="true"
$env:PORT="8978"
npm start
```

Then:

```powershell
$env:RIS_PREVIEW_TEST="true"
$env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:8978"
npx playwright test tests/e2e/preview.spec.ts
```

## Production gaps

The public preview is not a multi-user production service. Production still requires authenticated users/roles, persistent projects, verified RLS, backups, rate/abuse controls, monitoring, and a separately licensed/secured professional simulator if AnyLogic execution is offered.
