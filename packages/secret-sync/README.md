# @insecur/secret-sync

Secret Sync command surface and provider delivery adapters.

A Secret Sync writes a secret into a provider the customer already uses. This package owns the
command lifecycle, the authorization and approval gates that must clear first, and the
provider adapters behind substitutable ports.

## Owns

- Secret Sync command lifecycle: create, list, update via target patch, disable, and run.
- Access assertions for manage, read, project read, and run.
- Connection, binding, and executability assertions before a run.
- The protected-delivery approval gate for protected Secret Sync actions.
- Provider adapters behind `provider-lookup-port` and `provider-sync-write-port`:
  GitHub Actions secrets (with libsodium sealed boxes) and Cloudflare Worker secrets.
- Metadata-safe Secret Sync projections for read surfaces.
- Store error mapping to domain error codes.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.
- `@insecur/access` for Effective Access on every command.
- `@insecur/app-connection` for the provider connection boundary.
- `@insecur/protected-change` for protected delivery approval evidence.
- `@insecur/operations` for operation-bound run execution.
- `@insecur/crypto` for decrypting write materials inside the Runtime Worker.
- `@insecur/audit`, `@insecur/tenant-store`.
- `@noble/hashes` and `tweetnacl` for the GitHub sealed box.

## Does Not Own

- Provider OAuth app registration or installation flows (`@insecur/app-connection`).
- The delivery automation verdict (`@insecur/delivery-policy`).
- Runtime injection into a process (`@insecur/runtime-injection`).

## Interface Tests

Tests assert that each gate denies before the next one runs: access, then connection, then
executability, then protected-delivery approval. Adapter tests assert the exact provider
request shape and that a sealed box round-trips, using fake provider clients. No test may
reach a live provider.

## Dependency Rule

`decrypt-secret-sync-write-materials` is the only decrypt-capable path and runs only inside
the Runtime Worker. Sensitive Values must never appear in a run record, audit event, or
metadata-safe projection.
