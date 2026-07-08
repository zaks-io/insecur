# @insecur/api

The public **API Worker** (`insecur-api`) — the public edge of insecur (ADR-0077).

This deploy authenticates humans/agents/CI and composes the domain packages in `../../packages`. It
holds **no keyring**: it does not declare `INSTANCE_ROOT_KEY_V1`, so no route here can build one. Any
keyring-bound work (secret encrypt, grant consume = decrypt) is forwarded to the private **Runtime
Worker** (`apps/runtime`, `insecur-runtime`) over the `RUNTIME` Service Binding, carrying a scoped,
audience-bound hop token. This is the deploy-level expression of capability isolation; the lint
keyring boundary and the deploy-topology conformance gate (INS-199) enforce it.

See [`../../docs/setup.md`](../../docs/setup.md) for end-to-end setup,
[`../../docs/context-map.md`](../../docs/context-map.md) for package ownership, and
[`../../docs/specs/deploy-route-inventory.md`](../../docs/specs/deploy-route-inventory.md) for the
authoritative route → deploy table (generated via `pnpm routes:inventory`; edit
`deploy-route-inventory.sidecar.json` for human notes).

## Layout

```
src/index.ts            Composition root: mounts the public route groups, RUNTIME binding
src/routes/v1/*         Hono route wiring composed from the domain packages
src/rpc/*               Unwrap RuntimeRpcResult envelopes returned across the Service Binding
wrangler.jsonc          Local and dry-run Worker configuration (no secrets_store_secrets;
                        signing secrets delivered as encrypted Worker secrets in deploy)
```

## Route surface

`GET /healthz` plus the V1 product routes: `/v1/auth`, `/v1/session`, `/v1/onboarding`,
`/v1/orgs/:organizationId/projects` (secret write proxies `RUNTIME.writeSecret`),
`/v1/orgs/:organizationId/runtime-injection` (grant issue stays here; consume proxies
`RUNTIME.consumeGrant`).

## Owns

- Cloudflare Worker request handling and the public route surface.
- Caller authentication and minting the scoped hop token forwarded to the Runtime Worker.
- Hono route wiring composed from the domain packages.
- Transport-level request parsing and response formatting; mapping `RuntimeRpcResult` failures to
  error envelopes.

## Does Not Own

- The keyring or `INSTANCE_ROOT_KEY_V1` (Runtime Worker only).
- Encryption / decryption (Runtime Worker only).
- Effective Access decisions (resolved Runtime-side, inside the same call that decrypts — ADR-0034).
- Tenant-Scoped Store transaction rules.
- Secret Version append/current rules.
- Runtime Injection Grant state machines.
- Audit event metadata allowlists.
