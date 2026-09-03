# @insecur/runtime-injection-issue

Public-safe Injection Grant issue path and contracts.

This package is the half of runtime injection that can run on the public edge: it validates
and issues a grant. Consuming a grant means decrypting, so consumption lives behind the
Runtime Worker in `@insecur/runtime-injection`.

## Owns

- Injection Grant issue: authorization assertion, binding resolution, and TTL rules.
- Grant issuer binding and run-policy key grant binding assertions.
- Grant selectors and consume-selector matching contracts.
- The Injection Grant error type.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.
- `@insecur/access` for Effective Access on issue.
- `@insecur/audit` for grant issue audit events.
- `@insecur/tenant-store` for tenant-scoped grant persistence.

## Does Not Own

- Grant consumption, decryption, or delivery (`@insecur/runtime-injection`).
- Keyring access of any kind.
- The Storage Security Gate verdict that gates production delivery.

## Interface Tests

Tests assert that a grant is issued only for a resolvable binding within TTL, and that a
selector matches exactly the coordinate it was issued for. Denial paths are covered in
`@insecur/runtime-injection`'s integration suite, which owns the consume side.

## Dependency Rule

This package is on the public/contract side of the package-boundary conformance gate. It must
never import `@insecur/crypto` or any decrypt-capable module; the decrypt-import lint boundary
in `eslint.config.ts` enforces this.
