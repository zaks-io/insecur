# ADR-0053: Remote Build Cache Trust Model

Date: 2026-05-25
Status: Accepted

insecur uses a Turborepo remote cache for cross-step and local-to-CI artifact reuse, but only CI may write to it. Developer laptops and agents run with `--cache=local:rw,remote:r`: they read remote entries and write only their own local cache. CI runs with `remote:rw` and is the sole writer of shared artifacts. Cache artifacts are signed (`remoteCache.signature: true`, HMAC-SHA256, with `futureFlags.longerSignatureKey` enabled) and the signing key lives in `TURBO_REMOTE_CACHE_SIGNATURE_KEY`. `envMode: strict` is set so every task hashes only the environment variables it explicitly declares, keeping cache keys correct and side-channel free. The cache starts on the Vercel-managed backend already wired to the org (`TURBO_TOKEN`/`TURBO_TEAM`); a self-hosted Cloudflare R2 backend (`adirishi/turborepo-remote-cache-cloudflare`) is the reversible escape hatch if we choose to drop the Vercel dependency.

A shared build cache is a code-execution oracle: whoever can write an artifact can have it replayed into a later consumer, including the pipeline that ships production. For a secrets manager that is an unacceptable poisoning path, so write access is restricted to the audited, reviewed CI pipeline rather than tied to a person. The control is caller-agnostic by design: it holds against a future second contributor, a compromised developer laptop, and a rogue agent with filesystem access, because none of them is CI. Reads stay open so a cold local cache still produces correct builds quickly; only writes to the shared surface are privileged.

## Considered Options

- **Let every caller write the remote cache (Turbo default).** Rejected: any writer can poison every later consumer, including production CI, which is the worst outcome for this product.
- **No remote cache, local only.** Rejected: it discards the cross-CI-step and local-to-CI reuse that motivated caching at all.
- **Self-host the cache backend from day one.** Rejected for now: the Vercel-managed backend is already provisioned and needs no infrastructure to run. Self-hosting on R2 is kept as a documented, low-cost migration if the Vercel dependency becomes undesirable.

## Consequences

- The signature key is a shared secret and CI holds the write-capable credential. A leaked key is rotated, which invalidates existing cache entries; that cost is acceptable.
- `envMode: strict` means a task that reads an undeclared environment variable will not see it. This is a deliberate hash-correctness constraint, not a bug, and every task must declare its inputs.
- Switching backends (Vercel to self-hosted R2) is an endpoint and token change, not a code change, which is why the escape hatch stays cheap.
