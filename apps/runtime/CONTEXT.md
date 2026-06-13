# @insecur/runtime Context

Scoped context for agents working in `apps/runtime`. This file is a reading map,
not an independent glossary. Authoritative term definitions live in
`../../CONTEXT.md`.

## Role

The **Runtime Worker** is the decrypt-egress deploy (ADR-0077): the sole holder of the root key, with
no public routes, reachable only over the private Service Binding via the `RuntimeService` RPC seam.
It is the deploy-level expression of the crypto Module's decrypt-import allowlist (ADR-0071) and
ADR-0064. Keyring construction is fenced to `apps/runtime/src/**` by the lint keyring boundary; the
deploy-topology conformance gate (INS-199) asserts this deploy holds the key and serves zero
`/v1/*` routes.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/architecture.md`
- `../../docs/specs/deploy-route-inventory.md`
- `../../docs/adr/0071-decrypt-egress-import-boundary.md`

## Terms To Load

- Runtime Worker
- API Worker
- Crypto Module
- Keyring
- Instance Root Key
- Runtime Trust Boundary
- Effective Access Resolver
- Runtime Injection Grant Service
- Secret Version Store
- Audit Event Writer

## Adjacent Terms

- Secret Sync
- Tenant-Scoped Store
- Opaque Resource ID

## Owns

- `INSTANCE_ROOT_KEY_V1` and Keyring construction (the chokepoint, fenced to this deploy).
- Encryption and decryption — the decrypt-egress boundary.
- Hop-token verification (audience `insecur-runtime`).
- Runtime-side Effective Access resolution, run inside the same call that decrypts (ADR-0034).
- Secret Sync when it lands: runs **inline** here (ADR-0057), triggered synchronously from the API
  Worker over the binding. No sync worker, no Queues/DOs.

## Does Not Own

- Any public route or caller authentication (API Worker only).
- WorkOS session handling.
- Transport-level request shape for the public edge.
