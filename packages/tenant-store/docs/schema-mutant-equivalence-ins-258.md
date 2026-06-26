# Schema mutant equivalence (INS-258)

This note classifies Stryker mutants in `packages/tenant-store/src/db/schema/` after the
schema-shape conformance gate (`schema-shape.ts`, `schema-shape-registry.json`,
`test/schema-shape-conformance.test.ts`).

## Meaningful mutants (must fail tests)

These change Postgres semantics and are covered by unit-layer conformance tests:

| Class                                 | Examples                                                               | Gate                  |
| ------------------------------------- | ---------------------------------------------------------------------- | --------------------- |
| SQL table/column identifiers          | `pgTable("organizations")`, `text("org_id")`                           | Schema shape registry |
| `notNull`, `primaryKey`, `hasDefault` | removing `.notNull()` on tenant columns                                | Schema shape registry |
| Check constraint SQL                  | lifecycle stage allow-list, protected-environment rules                | Schema shape registry |
| Unique / partial unique indexes       | `nullsNotDistinct`, `where` clauses, column sets                       | Schema shape registry |
| Foreign keys                          | composite org/project coordinates, deferred secrets current-version FK | Schema shape registry |
| Plaintext metadata registry entries   | allowlisted column categories                                          | ADR-0070 conformance  |

## Equivalent mutants (static Drizzle authoring noise)

These do not change generated DDL when the SQL identifiers and constraint bodies are unchanged.
They are intentionally excluded from the mutation score via targeted `// Stryker disable`
directives in schema modules, not by ignoring whole files or the package.

| Class                                 | Why equivalent                                                                                             | Handling                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| TypeScript column property names      | Drizzle persists `text("sql_name")`; renaming `displayName` does not rename the SQL column                 | `// Stryker disable ObjectLiteral` on column definition objects                                      |
| Constraint/index display names only   | Schema-shape tests key on generated SQL + column sets; auto-generated Postgres names would match semantics | `// Stryker disable StringLiteral` on explicit name arguments where the SQL body is gated separately |
| File header comments                  | No runtime effect                                                                                          | None needed (Stryker does not mutate comments)                                                       |
| Re-export/barrel wiring in `index.ts` | No DDL surface                                                                                             | Excluded from `mutate` globs                                                                         |

## Measured outcome (INS-258)

After schema-shape conformance, export stability tests, `vitest.related=false` for the
tenant-store runner, and targeted `/* Stryker disable ObjectLiteral */` on Drizzle column maps:

| Scope                               | Before  | After (ratchet score) | After (covered score) |
| ----------------------------------- | ------- | --------------------- | --------------------- |
| `packages/tenant-store/src/**/*.ts` | 33.02%  | **65.03%**            | **80.60%**            |
| `tenant-hierarchy.ts`               | hotspot | **90.48%**            |                       |
| `tenant-collaboration.ts`           | hotspot | **91.38%**            |                       |
| `tenant-secrets.ts`                 | hotspot | **90.10%**            |                       |
| `instance-bootstrap.ts`             | hotspot | **91.49%**            |                       |
| `tenant-integrations.ts`            | hotspot | **90.38%**            |                       |

Ratchet score uses `killed / total mutants` from `config/mutation-ratchet.json`. Covered score excludes
`NoCoverage`, `Ignored`, and `Timeout` mutants.

`schema-shape-conformance.test.ts` statically imports every schema module so Vitest `related: true`
selects conformance tests when Stryker mutates any schema file (dynamic `loadUserSchemaTables`
imports alone were insufficient).

## Review commands

Use the repo-wide Stryker workflow from `docs/agents/testing.md`:

```bash
pnpm mutation:review -- --mutate "packages/tenant-store/src/**/*.ts"
pnpm mutation:baseline:update
pnpm mutation:ratchet:check
```

Focused tenant-store review updates `packages/tenant-store` in `config/mutation-ratchet.json`
when you run `pnpm mutation:baseline:update` after a scoped review. For a full-repo baseline,
run `pnpm mutation:review` without `--mutate`.

Regenerate the checked-in schema-shape registry after intentional DDL edits:

```bash
pnpm dlx tsx packages/tenant-store/scripts/generate-schema-shape-registry.ts
```
