# @insecur/web

Tenant web console BFF (`insecur-web`) on Cloudflare Workers with TanStack Start.

The browser reaches only this deploy. Authenticated server routes mint a short-TTL
`insecur-api`-audience scoped token and call the API Worker over the private `API` Service Binding.

## Local development

```sh
pnpm --filter @insecur/web dev
```

Run `apps/api` and `apps/runtime` alongside (`pnpm dev:workers`) for authenticated end-to-end use.

Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars` and align WorkOS/session secrets with
`apps/api/.dev.vars`.

The example file uses Cloudflare Turnstile dummy keys for local login. Preview and production need
`TURNSTILE_SITE_KEY` as a GitHub Environment variable and `TURNSTILE_SECRET_KEY` as a GitHub
Environment secret.

## Route surface

The console includes WorkOS login/logout and step-up callbacks, onboarding, organization switching,
project and environment metadata, the secret matrix and version history, access and delivery
views, people, audit, and approvals. `GET /whoami` remains an authenticated diagnostic proof. The
generated [`deploy-route-inventory.md`](../../docs/specs/deploy-route-inventory.md) is the
authoritative route list.
