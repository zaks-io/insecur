# Storage Security Gate readiness-fact audit

Audit of every readiness control in `docs/storage-security-gate.md` against
metadata-only fact sources the gate can compose at delivery time. Status values:

- **exists** — a composable runtime or evidence fact source is implemented in-repo.
- **partial** — some facts exist but the gate still needs wiring or supplemental evidence.
- **missing** — no fact source yet; control defaults to `unknown` until INS-54 wires probes.

Evidence-only controls cite test or release-gate commands; they do not require a
per-request runtime scan unless a future gate contract says otherwise.

| Control ID                               | Coverage     | Fact / evidence source                                                                                        | Notes                                                                                                                                                      |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage.root_key`                       | **partial**  | `@insecur/crypto` `checkTenantDataKeyReadiness` (`root_key.unreachable`)                                      | Proves root reachability for a scoped org/project when a Secrets Store or dev provider is wired. Does not alone prove Secrets Store binding configuration. |
| `storage.root_key_resident_surface`      | **evidence** | ADR-0064 unit tests (`crypto-runtime`, keyring-construction ESLint boundary, no-module-global tests)          | Structural invariant enforced in CI, not a per-delivery DB probe.                                                                                          |
| `storage.root_key_escrow`                | **exists**   | `@insecur/crypto` `checkRootKeyEscrowReadiness`                                                               | Metadata-only check of `custodyEvidenceRef` on organization data keys (`escrow-record://` prefix).                                                         |
| `storage.tenant_data_keys`               | **partial**  | `@insecur/crypto` `checkTenantDataKeyReadiness`                                                               | Active org/project data key rows for the delivery scope.                                                                                                   |
| `storage.key_versions`                   | **partial**  | Tenant-Scoped Store data-key metadata (`keyVersion`, `status`) + rotation/rewrap tests                        | Lifecycle states modeled in Postgres; no separate version-catalog probe yet.                                                                               |
| `storage.keyring`                        | **partial**  | `@insecur/crypto` `checkTenantDataKeyReadiness` + cross-tenant keyring tests                                  | Composes tenant key chain readiness for a scope; cache invariants remain test evidence.                                                                    |
| `storage.tenant_store`                   | **exists**   | `@insecur/tenant-store` `checkTenantStoreReadiness`                                                           | Runtime probe: active FORCE RLS + isolation policies on every tenant-owned table (`findOrgIdRlsViolations`) and runtime role `rolbypassrls = false`.       |
| `storage.secret_encryption`              | **partial**  | `@insecur/crypto` encryption + ciphertext swap tests; envelope binding fact for stored headers                | Identity binding enforced at decrypt; structural header check via `checkStoredEnvelopeBindingReadiness`.                                                   |
| `storage.key_version_binding`            | **exists**   | `@insecur/crypto` `checkStoredEnvelopeBindingReadiness`                                                       | Metadata-only parse of envelope header `tenantDataKeyVersion` vs expected key version (ADR-0026 DEK-wrap binding).                                         |
| `storage.provider_credential_encryption` | **partial**  | Provider-credential envelope tests + `checkStoredEnvelopeBindingReadiness`                                    | Same binding model as secrets under org data keys.                                                                                                         |
| `storage.sensitive_metadata_encryption`  | **partial**  | Plaintext Metadata Allowlist conformance (`pnpm verify`, `pnpm test:rls`) + sensitive-metadata envelope tests | Column placement is structural CI evidence; envelope correctness uses binding fact + encryption tests.                                                     |
| `storage.no_plaintext_persistence`       | **evidence** | `pnpm test:canary` ([ADR-0069](../../docs/adr/0069-no-plaintext-canary-gate.md))                              | Test/canary evidence only. No per-delivery runtime plaintext scan in V1.                                                                                   |
| `storage.delivery_fail_closed`           | **missing**  | INS-54 delivery-path enforcement + denial tests                                                               | Gate verdict enforcement on production delivery callers, not a storage-layer fact.                                                                         |

## Confirmed splits (INS-151)

### Active RLS + runtime role without `BYPASSRLS`

**Requires a runtime fact.** `checkTenantStoreReadiness` in `@insecur/tenant-store` queries
live `pg_roles` and `pg_class`/`pg_policies` through the runtime connection. CI background
evidence remains `pnpm test:rls` (INS-144) and `assert:rls-credentials`.

### No-plaintext persistence

**Evidence-only.** The gate should treat a passing `pnpm test:canary` run (and registered sweep
adapters as they land) as release evidence, not re-scan Postgres columns on every delivery
attempt. Delivery probes should accept injected evidence references (for example
`test_run_id`) or return `unknown` until release evidence is wired.

### Envelope binding readiness

**Composable.** `checkStoredEnvelopeBindingReadiness` exposes metadata-only header checks the
gate maps to `storage.key_version_binding` and supports `storage.secret_encryption` /
credential / Sensitive Metadata controls without decrypting payloads.

## Probe wiring (follow-up)

INS-54 owns composing these facts into `StorageSecurityGateReadinessProbes` on production
delivery paths. `@insecur/storage-security-gate` exports `mapReadinessReportToProbeOutcome`
helpers that convert package reports into `StorageGateProbeOutcome` without pulling crypto or
tenant-store into the gate dependency graph.
