# @insecur/delivery-policy

Delivery Risk Policy Presets and non-protected delivery automation resolution.

This package decides whether a delivery may run without a human in the loop. It resolves the
automation verdict for a coordinate, and it owns the explicit opt-in that lets a
non-protected preview or development Environment automate delivery.

## Owns

- Delivery Risk Policy Preset selection.
- Delivery automation resolution for a scoped coordinate.
- Preview automation opt-in: enable, revoke, and eligibility loading.
- Single-use delivery policy change evidence consumption.
- Delivery policy audit records and the package error type.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.
- `@insecur/access` for Effective Access on policy mutations.
- `@insecur/high-assurance` and `@insecur/protected-change` for step-up and approval evidence.
- `@insecur/operations` for operation-bound execution.
- `@insecur/audit` for policy change audit events.
- `@insecur/tenant-store` for tenant-scoped policy persistence.

## Does Not Own

- Protected Environment approval rules (`@insecur/protected-change`).
- Provider delivery execution (`@insecur/secret-sync`, `@insecur/runtime-injection`).
- The Storage Security Gate verdict (`@insecur/storage-security-gate`).

## Interface Tests

Tests assert the automation verdict for each preset and coordinate, and that opt-in and
revocation move eligibility in one direction only. Evidence consumption is tested as
single-use: a second consume of the same evidence must fail.

## Dependency Rule

Policy decisions are returned as verdicts. This package never performs the delivery it
authorizes and never touches Sensitive Values.
