# @insecur/worker-kit

Shared Worker HTTP, auth, abuse-control, and RPC composition glue.

The three Worker deploys share a request shape but not a capability. This package holds the
composition each one reuses, so route handlers stay thin and error mapping stays identical
across deploys.

## Owns

- HTTP: `handleRoute`, domain error to response mapping, the error code registry, HTTP status
  by error code, and shared route input parsing.
- Auth: request auth context construction, the admitted user resolver, and auth failure errors.
- Abuse: public edge rate limit bindings, abuse targets, and enforcement with denied-audit
  emission.
- RPC: the typed API client and the Runtime RPC contracts and method map used across the
  private Service Binding seam.

## Consumes

- `hono` for routing primitives.
- `@insecur/domain`, `@insecur/access`, `@insecur/auth`, `@insecur/audit`,
  `@insecur/tenant-store`, `@insecur/operations`.
- `@insecur/instance-bootstrap`, `@insecur/onboarding`, `@insecur/runtime-injection-issue`,
  and `@insecur/secret-store-contracts` for the contracts the edge routes expose.

## Does Not Own

- Any route's business logic. Routes live in `apps/api`, `apps/runtime`, and `apps/web`.
- Keyring access, encryption, or decryption.
- The route to deploy assignment, which is owned by `docs/specs/deploy-route-inventory.md` and
  enforced by `pnpm conformance:topology`.

## Interface Tests

The exit code and HTTP status lockstep test (ADR-0062) lives here: a domain error code must map
to the same HTTP status and CLI exit code everywhere. A fuzz suite (`test/fuzz`) drives route
input parsing against arbitrary input.

## Dependency Rule

This package is imported by public-edge deploys and must never import `@insecur/crypto` or any
decrypt-capable module. Error responses must not distinguish "exists but forbidden" from "does
not exist" across a tenant boundary (ADR-0062).
