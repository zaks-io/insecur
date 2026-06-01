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
- Worker HTTP mapping is unchanged: it already reads `code`, `message`, and `retryable` when present.
- Error messages remain metadata-only; they must not embed key material, ciphertext, plaintext, or connection strings.
