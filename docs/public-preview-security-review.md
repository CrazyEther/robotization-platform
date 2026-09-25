# Security review — RIS public preview

Review target: browser Digital Twin + read-only Cloudflare Worker.

## Trust boundaries

- `PUBLIC_PREVIEW_MODE=true` is enforced server-side for `/api/*`.
- Browser Digital Twin execution uses only local user inputs and public catalog data; it does not require a server compute secret.
- Server-side AnyLogic inspect/run is denied in preview even if the caller crafts the request manually.
- User/account/project write routes are denied in preview.
- Cloud/API secrets remain server environment variables and are never returned by `/api/v1/ris/cloud/status`.
- Static preview pages use `X-Robots-Tag: noindex, nofollow, noarchive`.

The UI flag is not considered a security boundary; tests issue direct HTTP requests against protected routes.

## Machine-checked evidence

The test suite verifies:
- safe preview GET endpoints remain readable;
- mutation/account/AnyLogic routes return `503 PREVIEW_READ_ONLY`;
- desktop and mobile preview can execute the browser Digital Twin;
- AnyLogic remains reported as disabled in preview;
- the main Digital Twin model validates inputs and records trajectory frames used for its KPI;
- robot frames satisfy the current non-overlap invariant.

## Not certified

This review does **not** certify user authentication, administrator roles, tenant isolation, live database RLS, DoS resistance, professional AnyLogic execution, physical robot safety or financial accuracy on a real site.

Verdict: acceptable as an isolated demonstration preview once the exact deployment commit passes CI; not a full production release.
