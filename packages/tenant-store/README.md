# @insecur/tenant-store

Tenant-Scoped Store and metadata-store adapter contract.

This package owns the persistence seam for tenant-owned metadata. Callers receive
a scoped SQL handle inside `withTenantScope`; the postgres.js pool is not exported.

## Entry point

```ts
import { withTenantScope } from "@insecur/tenant-store";

await withTenantScope({ kind: "organization", organizationId }, async (sql) => {
  return sql`SELECT id FROM projects WHERE org_id = ${organizationId}`;
});
```

Service Access uses `{ kind: "service" }` and sets `app.service` transaction-locally.

## Migrations

```bash
pnpm migrate:local   # requires DATABASE_URL_MIGRATION (see docs/setup.md)
pnpm dev:db:reset    # local Docker Postgres + migrate
```

SQL migrations live in `migrations/` and apply RLS policies in the same step as
table creation (ADR-0037).

## RLS tests

```bash
pnpm test:rls   # real Postgres as DATABASE_URL_RUNTIME; never SQLite/PGlite
```

Local runs load `DATABASE_URL_*` from the repo `.env.local` when present. CI uses
per-PR Neon branches (ADR-0054).

## Owns

- Scoped transaction Interface.
- Organization Access and Service Access store scope shapes.
- Transaction-local tenant scope setting.
- RLS-backed metadata isolation for First Value tables.
- Cross-tenant store regression tests against real Postgres.

## Does Not Own

- Effective Access semantics.
- Business rules for onboarding, secrets, runtime injection, or sync.
- Encryption, Keyring, or Sensitive Value handling.
- Audit event formatting.

## Dependency Rule

This package may depend on `@insecur/domain`. It must not depend on higher
domain packages such as `@insecur/secrets`, `@insecur/onboarding`, or
`@insecur/runtime-injection`.
