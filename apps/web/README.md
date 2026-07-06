# @insecur/web

Tenant web console BFF (`insecur-web`) on Cloudflare Workers with TanStack Start.

The browser reaches only this deploy. Authenticated server routes mint a short-TTL
`insecur-api`-audience scoped token and call the API Worker over the private `API` Service Binding.

## Local development

```sh
pnpm --filter @insecur/web dev
```

Run `apps/api` and `apps/runtime` alongside (`pnpm dev:workers`) for end-to-end `/whoami` proof.

Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars` and align WorkOS/session secrets with
`apps/api/.dev.vars`.

The example file uses Cloudflare Turnstile dummy keys for local login. Preview and production need
`TURNSTILE_SITE_KEY` as a GitHub Environment variable and `TURNSTILE_SECRET_KEY` as a GitHub
Environment secret.

## Proof route

`GET /whoami` — server-rendered page that resolves the browser WorkOS session, hops to
`/v1/session/whoami` on `insecur-api` through the Service Binding, and renders the admitted actor
metadata without returning an API bearer token to the client.
