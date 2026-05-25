# ADR-0037: Tenant-Scoped Bound Store Over Row-Level Security

Date: 2026-05-24

Status: Accepted

Persistence is reached through one tenant-scoped bound store. No route, domain function, or caller ever receives a raw SQL executor. A caller hands the store a structural scope and a callback; the store opens one short transaction, sets the tenant scope transaction-local for the engine, runs the callback against a scoped handle, and commits. The scope comes from the resolved actor (the Effective Access Resolver, ADR-0034), never from request input. This deepens the scaffold's persistence, which passed connections and mutable slugs around freely, into a single module that owns the transaction, the tenant scope, and the row filter.

Tenant isolation is three redundant layers, each covering a different failure of the others. First, an application filter: every tenant query carries `WHERE org_id = $1`, the primary boundary, and because the org id is in the query parameters it also keeps the Hyperdrive read path tenant-safe. Second, RLS policies as the engine backstop on the unencrypted metadata: `current_setting(..., true)` returns NULL when the scope is unset, so an unscoped query fails closed, and with `FORCE ROW LEVEL SECURITY` and a `NOBYPASSRLS` runtime role even a forgotten `WHERE` clause or a SQL-injection foothold cannot cross tenants. Third, tenant-bound crypto: the keyring (ADR-0031) protects the values, so a row that somehow leaks still yields ciphertext.

The scope reaches the engine as one of two settings, the engine form of the bright line ADR-0034 draws in the resolver. `app.current_org` carries Organization Access and matches one organization's rows; `app.service` carries Service Access, the cross-organization support, abuse, and incident gate (ADR-0019). The store sets exactly one from the scope kind. There is no ambient current-organization global, and breadth is structural rather than a token, the same rule ADR-0034 applies to scopes. Organization Access policies match on `app.current_org`, and the Service Access path is its own policy and its own audited gate, so "Organization Access never crosses Organizations" is now provable at the engine, not only in the resolver.

The resolver and the store split cleanly. The resolver (ADR-0034) decides what an actor may do within a tenant; the bound store decides which rows the tenant may touch at all. Capability against the row boundary. They share one input, the structural scope from the resolved actor, and one bright line, Service Access as the only cross-organization path. A route therefore carries neither a raw query nor an authorization branch: it resolves the actor, receives a scope, and hands the store a callback.

Resolving access through a scoped handle makes the interface the test surface. Given a scope and stored rows, the store returns exactly that tenant's rows, one value to assert, and the cross-tenant isolation test runs against the store directly, the same way ADR-0034 targets the resolver and ADR-0031 the keyring. RLS policies ship in the same migration as the table they protect, because a table without its policy is a silent cross-tenant leak; Drizzle owns the schema and a raw, re-runnable SQL step owns the policies and the two database roles.

## Consequences

A Postgres sequence, or a unique constraint on `(secret_id, version)` with `INSERT ... RETURNING`, removes the `MAX(n)+1` Secret Version race the D1 design carried, so version allocation is closed by the engine rather than by application locking.

No raw executor leaves the module. The pool (`postgres.js`, `prepare: false`, new per isolate, ADR-0036) is private, so a caller cannot hold a connection across the scope boundary or skip the scope setting.

For V1 there is no security-relevant read cache. Instant revocation leans on Postgres strong consistency, the Hyperdrive read cache stays off for security reads, and any hot-path cache is deferred to a later performance ADR.

Cross-tenant regression tests now target the bound store alongside the resolver (ADR-0034) and the keyring (ADR-0031). These three are the tenant boundary.
