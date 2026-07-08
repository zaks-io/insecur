# ADR-0062: Package-Seam Failures Are ErrorBody-Compatible

Date: 2026-06-01

Status: Accepted

## Decision

Every package that surfaces failures to the Worker or other callers must expose those failures in a shape compatible with `@insecur/domain`'s `ErrorBody`: a stable `KnownErrorCode` on `code` and a boolean `retryable`. Callers map any package failure to `errorEnvelope()` without learning package-private dialects.

This is a compatibility convention, not a forced `Result<T>` type. Packages keep their existing control-flow style:

- **Auth** continues returning `{ ok: false; failure }` with `AuthFailure`.
- **Crypto** and **audit** continue throwing typed errors.
- **Tenant-store** continues throwing for missing runtime configuration.

New error codes live in `packages/domain/src/error-codes.ts` (`CRYPTO_ERROR_CODES`, `STORE_ERROR_CODES`, `AUDIT_ERROR_CODES`, and future catalogs). Future First Value and production packages inherit the same rule when they surface failures across a seam.

### Crypto opacity carve-out

`DecryptError` must remain a single undifferentiated failure regardless of cause (wrong key, tampered ciphertext, ciphertext identity mismatch). All decrypt failure paths use `code: "crypto.decrypt_failed"` and `retryable: false`. `DecryptError` must not carry a `reason` or other discriminant that would leak which failure mode occurred (anti-oracle; see ADR-0026, ADR-0031, ADR-0044).

## Options Considered

- **Introduce a shared `Result<T>` and convert throw-based packages.** Rejected. Higher churn, no product benefit for First Value; auth already uses return-based failures.
- **Leave each package with private error shapes and teach the Worker four mappers.** Rejected. Duplicates mapping logic and blocks uniform CLI/API envelopes.
- **ErrorBody-compatible fields on existing thrown/returned failures.** Accepted. Minimal change; preserves package control flow.

## Consequences

- Domain catalogs gain crypto, store, and audit codes; `KnownErrorCode` includes them.
- Crypto `DecryptError` and `RootKeyNotConfiguredError`, audit `AuditEventValidationError`, and tenant-store `RuntimeConfigMissingError` expose `code` and `retryable`.
- Tests assert decrypt opacity (identical `code` across failure causes) and ErrorBody compatibility per package.
- Worker HTTP mapping is unchanged by this decision: it already reads `code`, `message`, and `retryable` when present. The status mapping itself is governed by the Amendment (2026-06-12) below.
- Error messages remain metadata-only; they must not embed key material, ciphertext, plaintext, or connection strings.

## Amendment (2026-06-12): HTTP status joins the normative error-code registry

The Error Code To Exit Code Mapping table in [cli-and-sync.md](../cli-and-sync.md) is normative for CLI exits and names `exitCodeForErrorCode` in `packages/cli/src/output/exit-codes.ts` as its enforcing implementation, with an explicit anti-fallback rule. The HTTP side had no equivalent: the only status mapping lived in `HTTP_STATUS_BY_CODE` in `apps/worker/src/http/domain-error-response.ts` plus ticket history (the doc cited "HTTP 401 per INS-165" as authority), and `httpStatusForKnownErrorCode` silently falls back to `500` for any unmapped code — the exact silent-inheritance hazard the exit side closed. This amendment gives HTTP status the same registry treatment:

- **One registry, two projections.** Every `KnownErrorCode` declares both its CLI exit code and its HTTP status in the single normative table in [cli-and-sync.md](../cli-and-sync.md); no second table exists elsewhere. Codes that never cross HTTP — client-side failures such as `injection.command_fingerprint_mismatch`, `injection.decrypt_failed`, and `injection.unreachable`, and the `sync.*` warning codes that ride operation status — carry an explicit "n/a (client-side)" cell, never a blank, so a deliberate non-mapping is always distinguishable from a missing decision. The worker map today contains codes absent from the table (the remaining `auth.*` codes, the `validation.*` codes, `onboarding.already_provisioned`, `onboarding.resource_conflict`, `store.runtime_config_missing`), so the registry gains rows as well as a column.
- **Enforcing implementation, lockstep, exhaustive both ways.** `HTTP_STATUS_BY_CODE` is the enforcing implementation and must change in lockstep with the table; the verifying test covers all `KnownErrorCode`s and is exhaustive in both directions — every map entry has a table row with the same status, and every table row carries either a status the map implements or the explicit n/a marker. The anti-silent-fallback rule mirrors the exit side's: when adding a new stable error code, extend the map and the table instead of silently inheriting the default `500`. Ticket citations stop being mapping authority; the table is the source of truth.
- **Forbidden/not-found indistinguishability is a mapping principle, not a per-ticket rediscovery.** Resource-shaped denials must not act as a resource-existence oracle over HTTP: `injection.grant_denied` and `injection.grant_expired` both map to HTTP `404` even though their CLI exits differ (`4` and `6`). The CLI's exit `5` legend, "not found or intentionally indistinguishable forbidden/not found," is the exit-side expression of the same posture. HTTP status is therefore not derivable from the exit column, which is why the registry carries both projections instead of one projection plus a rule.
- **Intra-tenant authorized-scope carve-out: `runtime_policy.secret_binding_environment_mismatch` → `400`, deliberately, not `404`.** The 404-collapse anti-oracle rule above governs _cross-boundary_ resource-shaped denials. A denial _within_ a scope the actor already holds is not a trust-boundary-crossing existence oracle and MAY distinguish exists-wrong-env (`400`) from not-found (`404`). Here the actor is already org+project+environment-authorized to configure the policy, `sec_*` IDs are opaque and non-enumerable, and the `400` discloses only "exists in your org, wrong environment" (no value, no metadata, no which-env). Collapsing it to `404` would leak nothing to an attacker who cannot enumerate the ID space yet would actively harm the legitimate configurer, who could no longer tell a typo from a right-secret-wrong-env binding. The distinction is required for that DX and is recorded here so the `400` is never re-litigated as an accidental invariant violation.
- **`crypto.decrypt_failed` maps to an opaque HTTP `500` deliberately.** Per the crypto opacity carve-out above, a decrypt failure is a single undifferentiated failure, and the HTTP status must not differentiate by cause either. The map and the table gain an explicit `crypto.decrypt_failed` → `500` entry so the opaque mapping is recorded as intended rather than inherited from the fallback.

The Consequences line above originally read "Worker HTTP mapping is unchanged"; that described this ADR's original blast radius — adopting ErrorBody-compatible failures did not alter the Worker — and remains true of that decision. As of this amendment the status mapping itself is a normative contract. Pre-launch the statuses are still free to change, but the registry that declares them is not optional: ADR-0007's stable, scriptable contract (stable error codes, predictable exit codes) freezes this surface the moment external CLI versions and CI integrations ship, and parallel implementation groups adding routes need the 409-vs-422 and 403-vs-404 answers written down rather than re-litigated per ticket.
