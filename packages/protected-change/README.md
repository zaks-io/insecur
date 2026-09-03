# @insecur/protected-change

Protected Change Orchestrator: tenant-qualified promotion and rollback Approval Requests,
their state machine, and metadata-only approval evidence.

A Protected Change is the record that a change to a Protected Environment was requested,
reviewed, and decided. Nothing here publishes a Secret Version; it decides whether a publish
is allowed to happen.

## Owns

- Protected Change records and the `create` / `transition` state machine.
- Promotion and rollback Approval Requests: create, approve, reject, cancel, supersede.
- Impact review state, its fingerprint, and the freshness assertion that invalidates a
  review after the underlying targets move.
- The protected secret mutation gate and single-use mutation evidence consumption.
- Protected delivery approval enforcement for a delivery target.
- Draft version discard authorization.
- Protected change audit codes and audit records.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.
- `@insecur/access` for Effective Access on every review and decision.
- `@insecur/auth` for the requesting and approving actor context.
- `@insecur/high-assurance` for step-up evidence on protected mutations.
- `@insecur/operations` for the Operation binding behind an approval.
- `@insecur/tenant-store` for scoped persistence.
- `@insecur/audit` for metadata-only approval and denial events.

## Does Not Own

- High-Assurance Challenge issuance (`@insecur/high-assurance`).
- Secret Version publish execution (`@insecur/secret-store`).
- Provider delivery (`@insecur/secret-sync`) or runtime injection (`@insecur/runtime-injection`).
- The delivery automation verdict (`@insecur/delivery-policy`).
- The web approval surface, which lives in `apps/web`.

## Interface Tests

Tests cover the state machine transitions, access assertions for create/review/discard,
approval and rollback request construction, impact review fingerprinting and freshness, and
audit code stability. Mutation evidence is tested as single-use. The integration suite
exercises the store under forced RLS.

## Dependency Rule

Approval evidence is metadata only. This package records who decided what about which
coordinate; it never carries the Sensitive Value the decision is about.

Deeper contract: `docs/protected-change-orchestration.md`. Reading map: `CONTEXT.md`.
