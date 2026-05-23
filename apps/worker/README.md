# @insecur/worker

Cloudflare Worker API for insecur. Hono + D1 + WebCrypto envelope encryption.

This package currently contains the pre-v1 scaffold API. It is useful for validating shape, but it is not production-ready for valuable secrets until the v1 security baseline in `../../docs/security-plan.md` is implemented.

See [`../../docs/setup.md`](../../docs/setup.md) for end-to-end setup.

## Layout

```
src/
  index.ts              Hono app, route wiring
  env.ts                Worker env + Variables types
  util.ts               base64, sha256, randomBytes, constant-time compare
  crypto.ts             AES-256-GCM envelope encryption (KEK wraps per-version DEK)
  session.ts            HMAC-signed session cookie
  auth.ts               Bearer token + session authz middleware
  scopes.ts             Machine token scope parsing + project checks
  audit.ts              audit_log writer
  routes/
    oauth.ts            GitHub OAuth login + callback + logout
    projects.ts         Projects + environments CRUD
    secrets.ts          Secrets CRUD + versions + rollback + bulk dotenv
    tokens.ts           Machine token mint + list + revoke
migrations/
  0001_init.sql         schema
```

## Routes

| Method | Path | Auth |
|---|---|---|
| GET    | `/health` | none |
| GET    | `/v1/auth/github/login` | none |
| GET    | `/v1/auth/github/callback` | none |
| POST   | `/v1/auth/github/logout` | session |
| GET    | `/v1/me` | session/bearer |
| GET    | `/v1/projects` | session/bearer |
| POST   | `/v1/projects` | session human |
| GET    | `/v1/projects/:slug/envs` | session/bearer |
| POST   | `/v1/projects/:slug/envs` | session human |
| GET    | `/v1/projects/:p/envs/:e/secrets` | project read |
| GET    | `/v1/projects/:p/envs/:e/secrets/:name` | project read |
| PUT    | `/v1/projects/:p/envs/:e/secrets/:name` | project write |
| GET    | `/v1/projects/:p/envs/:e/secrets/:name/versions` | project read |
| POST   | `/v1/projects/:p/envs/:e/secrets/:name/rollback` | project write |
| GET    | `/v1/projects/:p/envs/:e/dotenv` | project read |
| POST   | `/v1/tokens` | session (humans only) |
| GET    | `/v1/tokens` | session human |
| POST   | `/v1/tokens/:id/revoke` | session human |
