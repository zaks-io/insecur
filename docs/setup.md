# Setup

There is not yet a supported product setup path for storing or delivering secrets. The accepted
setup path today is contributor and agent verification of the scaffold.

1. Use Node 24 and pnpm 10.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Run `pnpm dev:check`.
4. Run `pnpm verify`.
5. Run `pnpm build`.
6. Optionally run the copyable proof:
   `INSECUR_PROOF_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") node examples/first-value-proof/verify.mjs`.

The local Worker skeleton can be started with:

```sh
pnpm dev:worker
```

Then check `http://localhost:8787/healthz`. This route is a scaffold health check only. It does
not prove product storage, authentication, authorization, encryption, audit, or Runtime Injection
behavior.

## Local Configuration

- `.env.example` documents optional service keys for future product slices.
- Copy keys into `.env.local` only when a task explicitly needs real service access.
- `apps/worker/.dev.vars.example` documents local Worker variable placement.
- `.env.local`, `.env.production`, and `.dev.vars` are ignored and must not be committed.

`pnpm dev:check` reports missing optional service keys by name and never prints values.

V1 product setup guidance should be written only after the tenant-first authorization model,
WorkOS AuthKit, short-lived machine access, tenant-bound key hierarchy, Sensitive Metadata
encryption, audit/export integrity, and
[security release gates](security-runbooks-and-release-gates.md) are implemented. Until then,
scaffold verification commands are contributor documentation only and must not be used with
valuable secrets.
