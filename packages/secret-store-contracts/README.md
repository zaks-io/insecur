# @insecur/secret-store-contracts

Public-safe Secret Write validation and error contracts.

The public edge has to reject a bad Secret Write without being able to read a good one. This
package holds exactly the validation that can run without key material.

## Owns

- Variable Key validation for writes.
- Text secret value validation and UTF-8 validity checking.
- Safe Secret Value ingress: the single entry point a value passes through before it reaches
  encryption.
- Descriptive Secret Write verdicts and the Secret Write error type.
- Shared Secret Write constants.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.

## Does Not Own

- Secret Version persistence or Blind Secret Write rules (`@insecur/secret-store`).
- Encryption of the validated value (`@insecur/crypto`, behind the Runtime Worker).

## Interface Tests

Tests assert the verdict for each rejection reason and that ingress rejects before any value
is retained. A fuzz suite (`test/fuzz`) drives UTF-8 validation and ingress against arbitrary
byte input; it runs under `pnpm test:fuzz`.

## Dependency Rule

This package is on the public/contract side of the package-boundary conformance gate. It may
depend only on `@insecur/domain` and must never enter the crypto graph. Validation verdicts
must never echo the submitted value.
