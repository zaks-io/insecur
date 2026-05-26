# @insecur/secrets

Secret Version Store and Blind Secret Write rules.

This package owns the lifecycle for stored Secrets and Secret Versions. Callers
should ask it to perform a Blind Secret Write or inspect metadata; they should
not hand-roll validation, version append, Current Version selection, or
metadata-only output behavior.

## Owns

- Secret Shape and Variable Key use in stored Secret metadata.
- Text Secret Value validation, size limits, and empty-value behavior.
- Blind Secret Write create-or-update behavior.
- Secret Version append and Current Version selection for non-protected
  development Environments.
- Wrapped-material persistence through the Secret Version Store.
- Metadata-only write result shapes and stable secret-write error codes.

## Consumes

- `@insecur/domain` for shared identity and validation primitives.
- `@insecur/tenant-store` for scoped persistence.
- `@insecur/crypto` for Encryption Envelope behavior.
- `@insecur/audit` for metadata-only audit events.
- Caller-supplied Effective Access from `@insecur/access`.

## Does Not Own

- Runtime Injection Grants or child process execution.
- Protected Environment Promotion, Approval Requests, or rollback.
- Provider Secret Sync.
- Raw SQL executors.
- Human authentication.

## Interface Tests

Tests should exercise Blind Secret Write and Secret Version Store Interfaces:
valid generated values, stdin values, empty-value denial or acceptance, UTF-8
and size validation, append/current behavior, and metadata-only outputs.

## Dependency Rule

This package may consume lower packages. It should not import worker routes, CLI
commands, provider adapters, or protected-change orchestration.

