# ADR-0077: Capability-Isolated Worker Deploys

Date: 2026-06-13

Status: Accepted

## Decision

The V1 control plane runs as **multiple capability-isolated Cloudflare Worker deploys**, not one
worker. Capability isolation is structural — separate deploys with separate token audiences and a
private Service Binding between them — not a role conditional inside one deploy. The normative
topology and the binding invariant are owned by `docs/specs/product-spec.md` §2 (per
[ADR-0067](0067-documentation-content-ownership-and-the-single-statement-rule.md), the spec owns
decided behavior, invariants, and the V1 boundary); this ADR records the rationale and consolidates
the deploy-shape decisions that were previously scattered across ADR-0051/0052/0064/0071/0019.

The deploys:

- **API** (`apps/api`, `insecur-api`) — public caller-agnostic edge; holds no keyring / root-key
  binding.
- **Runtime** (`apps/runtime`, `insecur-runtime`) — the sole holder of `INSTANCE_ROOT_KEY_V1` and the
  only place ciphertext becomes plaintext; no public routes; reached only over a private Service
  Binding via a `WorkerEntrypoint` RPC seam with a short-TTL scoped token; the Effective Access
  Resolver ([ADR-0034](0034-authorization-through-a-single-effective-access-resolver.md)) runs inside
  it, so authorization and decryption are one indivisible call.
- **Web** (`apps/web`, `insecur-web`) — the BFF (ADR-0051/0052).
- **Service Access** — a separate deploy with its own auth audience, deferred past V1 (ADR-0019).

**Invariant (owned by the spec, restated here only for traceability): no deploy holds both a public
route group and the root-key binding; exactly one deploy declares `INSTANCE_ROOT_KEY_V1` and it
serves zero public routes.**

## Why

The product is no-reveal custody: nobody — not the agent, not CI, not the operator — gets a plaintext
read path. A single worker that serves public auth/session/onboarding while also holding decrypt
authority puts the surface that turns ciphertext into plaintext in the same isolate, and therefore the
same blast radius, as every public route. One RCE, one dependency compromise, or one logic bug in any
public route then reaches the keyring. That makes the no-reveal claim a property of "trust the worker"
rather than a structural fact.

[ADR-0064](0064-minimize-secret-resident-surface.md) requires minimizing the secret-resident surface
and [ADR-0071](0071-decrypt-egress-import-boundary.md) fences decrypt egress at the import boundary in
code. This ADR applies the same principle at the deploy boundary: the decrypt-capable surface is its
own deploy that holds no public routes, so the isolation is enforced by topology (a missing binding, a
private-only Service Binding) instead of a code conditional that a future change can erase.
[ADR-0051](0051-web-console-architecture.md) line 20 already rejected the role-gated single-deploy for
the same reason — "a structural deploy-and-token boundary rather than role conditionals in shared
code." The drift this ADR corrects is that the decision lived only in ADR-0051 and never reached the
spec, so the implementation built a monolith from the spec's "one Cloudflare Worker API" phrasing.

## Options Considered

- **One worker, capability gated by route-level checks and a request-scoped keyring.** Rejected. The
  keyring constructor is reachable from any route in the isolate; isolation is a code conditional, and
  every public route shares the decrypt blast radius. Contradicts ADR-0064/0071 intent and ADR-0051's
  structural-boundary decision.
- **Split only the human/web surface (ADR-0051) but keep all API + decrypt in one deploy.** Rejected.
  It leaves decrypt authority co-resident with the public API edge, which is the exact failure mode
  no-reveal custody must prevent.
- **Capability-isolated deploys with the decrypt/runtime surface as its own private deploy.**
  Accepted. The root key lives in exactly one deploy that serves no public routes; the public API
  cannot construct a keyring (the binding and the import are both absent); authorization and decrypt
  are one call behind the RPC seam.

## Consequences

- A CI conformance gate enforces the invariant (no deploy holds both a public route and the root-key
  binding; exactly one declares `INSTANCE_ROOT_KEY_V1` with zero public routes), extending the
  ADR-0071 lint boundary from imports to deploy bindings and the route inventory.
- Only the Runtime deploy binds Hyperdrive and performs DB I/O. The public API deploy holds no
  Hyperdrive binding and does ZERO DB I/O: every non-keyring DB operation (admission resolution,
  guided/operator organization provisioning, invitation create/accept, operation polling, grant
  issue, bootstrap status/claim, denied-admission audit) is forwarded to the Runtime over the private
  Service Binding. Forced RLS (`NOBYPASSRLS`, ADR-0037) remains the tenant wall in the Runtime deploy.
  - **Two trust shapes cross the seam.** Authenticated forwards carry a scoped, audience-bound hop
    token minted from the already-resolved actor (the same token write/consume use); the Runtime
    verifies it and rebuilds the actor — the API never sends an actor object. The three pre-auth
    identity/metadata calls (`resolveAdmission`, `recordAdmissionDenied`, `getBootstrapStatus`) carry
    NO token, because admission resolution is the step that maps a WorkOS subject to an insecur user
    id and no token can exist before it. They are trusted by the private Service Binding boundary
    itself: the Runtime serves zero public routes (so only the bound API deploy can reach them), they
    touch no keyring, and they return only identity/metadata — no decrypt path is exposed even at the
    boundary.
- **The Runtime opens its Postgres client per RPC request, never as a module singleton.** A
  `postgres.js` client's socket promises are pinned to the I/O context of the request that created
  them, so a client cached across RPC invocations cancels its continuations ("promise resolved from a
  different request context") and the rejected query collapses to a generic `auth.invalid`. The
  Runtime therefore opens a request-scoped client (`runWithRuntimeConnection`, `max: 1` since
  Hyperdrive pools server-side) inside each invocation, exposes it to the connection-agnostic store
  API via async-local storage, and hands the socket `end()` to `ctx.waitUntil`. The module-level
  fallback pool exists only for the Node/local test path (single context, no cross-request hazard).
- Secret Sync stays inline in the Runtime deploy (ADR-0057); re-adding a separate execution surface
  later is additive, not required.
- ADR-0027's "one Cloudflare Worker" data-plane statement is amended to reference this ADR so it
  cannot be re-misread as mandating a single deploy.

Trace: [product-spec.md §2](../specs/product-spec.md),
[ADR-0027](0027-shared-instance-topology-and-binding-map.md) (amended),
[ADR-0019](0019-service-access-without-secret-reveal.md),
[ADR-0034](0034-authorization-through-a-single-effective-access-resolver.md),
[ADR-0051](0051-web-console-architecture.md),
[ADR-0052](0052-web-no-reveal-boundary-and-management-parity.md),
[ADR-0057](0057-inline-sync-execution-and-partial-failure-model.md),
[ADR-0064](0064-minimize-secret-resident-surface.md),
[ADR-0071](0071-decrypt-egress-import-boundary.md),
[ADR-0067](0067-documentation-content-ownership-and-the-single-statement-rule.md).
