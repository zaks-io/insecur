# @insecur/high-assurance

Operation-bound High-Assurance Challenge evidence for metadata-safe step-up flows.

A High-Assurance Challenge is the step-up a sensitive operation must clear before it runs.
This package owns the challenge lifecycle and the single-use evidence it produces; the
authenticator itself lives in `@insecur/auth`.

## Owns

- Challenge lifecycle: request, status resolution, clear, and deny.
- Single-use High-Assurance evidence validation and consumption, including expiry.
- The risk reason code and authentication method code catalogs.
- The protected-environment mutation gate and its handoff error.
- Challenge audit records and finalization of pending challenge audits.
- `HighAssuranceChallengeError` and `HighAssuranceHandoffError`.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.
- `@insecur/auth` for session assurance evaluation on a clear attempt.
- `@insecur/access` for Effective Access on deny and review surfaces.
- `@insecur/operations` for the Operation binding and review item shape.
- `@insecur/tenant-store` for scoped challenge persistence.
- `@insecur/audit` for metadata-only challenge audit events.

## Does Not Own

- Factor verification. WorkOS MFA and passkey assurance are evaluated in `@insecur/auth`.
- Approval decisions (`@insecur/protected-change`).
- The routes and console surfaces that present a challenge.

## Interface Tests

Tests cover the full challenge flow, deny paths and their audit validation, challenge id
shape, and the protected-environment mutation gate. Evidence is tested as single-use: a
second consume of the same evidence must fail.

## Dependency Rule

Challenges bind to an Operation, never to a Sensitive Value. Evidence carries metadata only
and this package never sees plaintext or key material.
