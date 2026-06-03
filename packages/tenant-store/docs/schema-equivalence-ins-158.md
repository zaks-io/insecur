# Schema equivalence (INS-158 / ARCH-2 S2)

Fresh databases built from the retired 18-file `migrations/` tree and from Drizzle `0002` +
`sql/policies-and-roles.sql` are intended to be **metadata-equivalent** on Postgres 17 (local Docker /
Neon CI).

## Verification performed

- Applied Drizzle baseline `0000`–`0002` (product DDL + in-migration RLS) and re-runnable
  `sql/policies-and-roles.sql` on a clean database.
- `pnpm test:rls` (21 tests) passed using `DATABASE_URL_RUNTIME` (`insecur_runtime`, `NOBYPASSRLS`),
  distinct from `DATABASE_URL_MIGRATION`.
- `pnpm verify`, `pnpm build`, and `pnpm test:rls` green on the change branch.
- `pnpm --filter @insecur/tenant-store db:generate` reports **no schema changes** after edits (schema,
  snapshot, and `0002` migration agree).

## Source of truth

`packages/tenant-store/src/db/schema/` (barrel: `index.ts`) is the Drizzle schema source. Constraints
below are declared in TypeScript—not hand-appended to SQL:

| Object                                                                                   | Location                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `secrets_org_id_id_current_version_id_fkey`                                              | `tenant-secrets.ts` (deferred `foreignKey` after `secretVersions`)  |
| `invitations_one_pending_per_invitee_org_project` (`NULLS NOT DISTINCT`, partial unique) | `tenant-collaboration.ts` via `uniqueIndex(...).nullsNotDistinct()` |

`drizzle-kit@0.31.10` is patched (`pnpm.patchedDependencies`) so partial unique indexes emit
`NULLS NOT DISTINCT` in snapshots and migrations. `pg-core.ts` extends `IndexBuilder` with
`.nullsNotDistinct()` for schema authoring.

## Known benign differences

| Area                                | Legacy hand migrations                       | Drizzle baseline                                                                                 |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Constraint / index names            | Shorter explicit names where authored        | Some auto-generated names truncated to Postgres 63-char limit (NOTICE only; semantics unchanged) |
| `sensitive_metadata_fields` PK name | `PRIMARY KEY (...)` inline                   | Drizzle-generated PK constraint name (same columns)                                              |
| Apply order                         | 18 lexicographic files + `schema_migrations` | `drizzle.__drizzle_migrations` + single product migration                                        |

## RLS atomicity

Tenant table DDL, `ENABLE`/`FORCE ROW LEVEL SECURITY`, and `CREATE POLICY` for each protected table
live in the same Drizzle migration file (`drizzle/0002_dapper_retro_girl.sql`), so drizzle-kit applies
them in one transaction per migration. `sql/policies-and-roles.sql` remains the idempotent ADR-0037
re-run step (predicates, force-enable loop, grants).

## Roles

Migration and runtime roles are still provisioned by `infra/postgres/init/001-local-roles.sh` (local)
or Neon host setup (CI); not embedded in schema migrations (no secrets in SQL).
