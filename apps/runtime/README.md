# @insecur/runtime

The private **Runtime Worker** (`insecur-runtime`) — the decrypt-egress deploy (ADR-0077).

This is the **only** deploy that holds `INSTANCE_ROOT_KEY_V1` (bound from Cloudflare Secrets Store),
so it is the only place ciphertext becomes plaintext. It serves **zero public `/v1/*` routes**: its
default `fetch` handler returns 404, and it is reachable only over a private Cloudflare Service
Binding via the `RuntimeService` `WorkerEntrypoint` RPC seam. This is the deploy-level expression of
the ADR-0071 decrypt-egress boundary and ADR-0064 (minimize the decrypt-capable surface); the lint
keyring boundary and the deploy-topology conformance gate (INS-199) enforce it structurally.

See [`../../docs/specs/deploy-route-inventory.md`](../../docs/specs/deploy-route-inventory.md) for the
route → deploy table and [`../../docs/architecture.md`](../../docs/architecture.md) for the topology.

## Layout

```
src/index.ts                   Exports RuntimeService; default fetch returns 404 (no public routes)
src/runtime-service.ts         The RuntimeService RPC seam: consumeGrant (decrypt), writeSecret (encrypt)
src/crypto/keyring-context.ts  Keyring construction — the chokepoint fenced to this deploy only
src/rpc/*                      Hop-token verification + RpcResult error mapping across the seam
wrangler.jsonc                 secrets_store_secrets: [INSTANCE_ROOT_KEY_V1]; hop-token secret via
                               encrypted Worker secret in deploy (not plaintext var)
scripts/deploy-content-only.mjs
                               Production CI deploy entrypoint
scripts/deploy-content-only-lib.mjs
                               Upload code and refresh public deploy vars while preserving bindings
```

Production CI intentionally does not run `wrangler deploy` for this Worker. Wrangler treats the
Secrets Store binding association as a Secrets Store write, which would give CI authority to mutate
root-key custody. Instead, CI builds the same Worker bundle, verifies the deployed Runtime bindings
and settings match `wrangler.jsonc`, uploads only script content, and patches public plain-text
deploy vars such as `SENTRY_RELEASE` so runtime errors report the same release as uploaded maps.

## The seam

Two coordinate-shaped RPC methods. The API Worker passes IDs plus a scoped, audience-bound hop token;
nothing crypto-shaped crosses. Custom error properties (`code`/`retryable`) do not survive the RPC
boundary, so failures are returned as a discriminated `RuntimeRpcResult` (data, not thrown), and the
API re-throws a shaped error.

- `consumeGrant(...)` — the ADR-0071 egress point: resolves the grant, decrypts, returns the delivery
  envelope (plaintext base64url-encoded for clone-safety).
- `writeSecret(...)` — authorizes the scope then encrypts and appends the Secret Version.

**Authorization and decryption are one indivisible call (ADR-0034):** the package functions run the
single Effective Access resolver internally before they touch the keyring, so there is no
"decrypt-without-authorize" path to split across the seam.

## Owns

- `INSTANCE_ROOT_KEY_V1` and keyring construction.
- All encryption / decryption (the decrypt-egress boundary).
- Hop-token verification (audience `insecur-runtime`).
- The Runtime-side Effective Access resolution that runs inside the same call that decrypts.
- Secret Sync, when it lands: it runs **inline** here (ADR-0057), triggered synchronously from the API
  Worker over the binding — no sync worker, no Queues/DOs.

## Does Not Own

- Any public route or caller authentication (API Worker only).
- WorkOS session handling.
