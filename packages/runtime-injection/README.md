# @insecur/runtime-injection

Runtime Injection Grant Service.

This package owns server-side Runtime Injection decisions and one-use Injection
Grant state. CLI process spawning stays in `@insecur/cli`; this package decides
which exact Variable Keys may be delivered for a requested run.

## Owns

- Injection Grant issue and consume rules.
- One-use grant invariants.
- Direct non-protected `--variable-key` First Value convenience behavior.
- Runtime Injection Policy evaluation once policies are implemented.
- Metadata-only run status and denial result shapes.
- Tests for output safety and exact Variable Key delivery.

## Consumes

- `@insecur/domain` for identity and result shapes.
- `@insecur/access` for caller-supplied Effective Access checks.
- `@insecur/secret-store` for selected Secret Version material.
- `@insecur/tenant-store` for scoped grant persistence.
- `@insecur/audit` for issue, consume, and denied-attempt events.

## Does Not Own

- Local child process spawning.
- Child stdout or stderr capture.
- Secret Version append behavior.
- Provider Secret Sync.
- Protected Environment approval.
- The Runtime Trust Boundary after values enter the child process.

## Interface Tests

Tests should prove each run consumes a fresh Injection Grant, only the requested
Variable Key is delivered, grant reuse fails, denied attempts are audited, and no
Sensitive Value appears in CLI, JSON, audit, logs, local config, or operation
records.

## Dependency Rule

This package may consume lower packages. It must not import `@insecur/cli` or
worker route code.
