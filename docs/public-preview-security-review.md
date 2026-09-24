# Security review — RIS public preview (2026-09-24)

**Scope:** Dedicated Cloudflare Worker `ris-public-preview`, no compute backend or user database. Existing Worker `robotization-platform` and local Docker/SimPy/JaamSim are outside the published artifact and were not modified.

## Threat boundaries

- Anonymous internet visitor → Worker HTTP API: `PUBLIC_PREVIEW_MODE=true` enforced **server-side** in `apps/api/app.ts`. Only GET health/config/catalog are allowed; any other `/api/*` returns `503 PREVIEW_READ_ONLY`. UI flag `VITE_PUBLIC_PREVIEW=true` and disabled buttons are **not security boundaries**.
- Internet visitor → private project data / user or admin account: no database or identity provider is bound to the preview Worker. Protected routes cannot execute in preview even if a caller crafts requests directly.
- Internet visitor → costly Python/Java compute: no compute service URL or secret is bound to the preview Worker; direct simulation and comparison APIs are denied before their handlers run.
- Search engines / public perception: static preview responses have `X-Robots-Tag: noindex, nofollow, noarchive`; user-facing disclaimer distinguishes preview from an engineering investment product.
- Dependencies / credentials: `npm audit --omit=dev --audit-level=high` returned no reported vulnerabilities at review time. This is **not** a proof against unknown vulnerabilities. The Wrangler OAuth token remains on the authorized computer and is not bundled or committed.

## Machine-checked evidence

- Unit test: only three safe GET endpoints; reject direct simulation, economics, organizations, and import requests; do not accidentally allow POST to a read-only GET path.
- Unit test: preview static assets carry `X-Robots-Tag`.
- Playwright desktop and mobile test: preview banner, object selection, 44 catalog cards, disabled simulation trigger, HTTP 503 on protected APIs.
- Real public URL: GET `/` and catalog/config/health return 200, `X-Robots-Tag` set on home page, protected API requests return 503.

## Explicitly **not** certified for public production

User registration, ordinary user/admin roles, persistent projects, RLS against a live DB, CSRF/OAuth flows, email verification, account recovery, compute rate limiting and job quotas, DoS resistance, tenant isolation under real sessions, industrial simulation precision and financial outcome validity are **unimplemented or unverified** for public hosting. A clean preview audit does not justify enabling write or compute routes by removing `PUBLIC_PREVIEW_MODE`.

**Verdict:** Public **read-only preview** acceptable for demonstration of UI/catalog with the documented restrictions. Full production site remains **NOT READY**.
