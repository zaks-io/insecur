# insecur: Threat Model and Security Design

**A design white paper.**

Status: draft for review. Last updated 2026-07-01.

This document describes what insecur is designed to prevent, the adversaries it models, and the
structural controls it relies on. It describes the **design and its guarantees** — the properties
the architecture is built to hold, and the mechanisms that enforce them.

The most important framing is [§2.4](#24-no-reveal-custody-defined): insecur provides **no-reveal
custody**, a guarantee about the product surface, and deliberately does not claim to be
zero-knowledge. That distinction is drawn precisely there.

Terminology and the authoritative product decisions live in the repo: the product spec
(`docs/specs/product-spec.md`), the architecture doc (`docs/architecture.md`), and the ADRs
(`docs/adr/`). Where this paper and those disagree, those win.

---

## 1. What the System Is

insecur is a secrets-custody control plane for teams shipping with coding agents and CI on a
Cloudflare / GitHub Actions / Vercel stack. It holds the canonical secret, lets code, agents,
and CI _use_ the secret, and gives no one a plaintext path to _read it back_ through the
product: not the agent, not CI, not the developer, not the operator's support staff.

The core insight is that in an agent-heavy workflow the dangerous object is the **read path,
not the storage location**. A `.env` file on disk is dangerous because an agent with shell
access can `cat` it. An environment variable is dangerous because an agent can `echo
$API_KEY`. A secrets manager that decrypts to a plaintext value on request is dangerous
because the agent can call that request and print the result. Access-control lists, prompt
rules (`CLAUDE.md`), and ignore files (`.cursorignore`) are all advisory: they do not stop a
tool call, and by the time the model "notices" it violated a rule, the secret is already in
the transcript. (Public evidence for this framing: `docs/research/problem-evidence.md`.)

insecur's thesis is that you cannot out-watch a swarm of fast agents, so the only durable
control is **structural**: remove the readable-secret primitive from the surfaces agents can
reach. Two promises, in order:

1. **Diskless Development Secret Use.** Stop giving agents plaintext local secret files.
   Secrets load into a child process at runtime as environment variables and never touch
   disk, even on the developer's own machine.
2. **No-reveal production custody.** Let agents and CI _cause_ approved deploy and runtime
   workflows without giving local agents or ordinary human sessions a read path to
   Protected Environment sensitive values.

### 1.1 Deployment Topology (the spine of the whole model)

Almost every structural control in this paper reduces to one deployment decision: **capability
isolation across separate Cloudflare Worker deploys.** insecur is not a monolith.

| Deploy                          | Role                                                                                                                    | Holds root key? | Public routes? | DB binding?      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------- | -------------- | ---------------- |
| **API** (`insecur-api`)         | Public edge. Authenticates humans/agents/CI. Runs no crypto and no DB I/O.                                              | No              | Yes            | No               |
| **Runtime** (`insecur-runtime`) | Sole holder of `INSTANCE_ROOT_KEY_V1`. The only place ciphertext becomes plaintext. Runs the Effective Access Resolver. | **Yes**         | **No**         | Yes (Hyperdrive) |
| **Web** (`insecur-web`)         | BFF. Owns the human session cookie, CSRF, rotation.                                                                     | No              | Yes            | No               |

The **topology invariant** is normative and machine-enforced: _no deploy may hold both a
public route group and the root-key binding. Exactly one deploy declares the root key, and it
serves zero public routes._ The API edge reaches the Runtime only over a private Cloudflare
Service Binding through a `WorkerEntrypoint` RPC seam carrying a short-TTL scoped token. There
is no public HTTP path to the deploy that can decrypt.

This is why "steal a request token and ask for plaintext" does not work the way it does
against a monolith: the surface an attacker can reach (API) is structurally incapable of
decryption, and the surface that can decrypt (Runtime) is not internet-reachable. Authorization
and decryption happen in the _same_ Runtime call, so there is no window where an
authorization check passes but the decrypt runs somewhere less trusted.

Enforcement (not just documentation):

- `pnpm conformance:topology` parses each `apps/*/src/index.ts` and fails CI if the live route
  mounts drift from the authoritative table (`docs/specs/deploy-route-inventory.md`).
- An ESLint restricted-import boundary (`eslint.config.ts`, ADR-0071) fails CI if decrypt
  output is imported into a module not on the decrypt-egress allowlist.
- A package-boundary gate keeps public/contract packages off the crypto dependency graph.

---

## 2. Assets, Trust Boundaries, and Adversaries

### 2.1 Assets

| Asset                                                             | Why it matters                            | Primary protection                                                                                     |
| ----------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Protected Environment sensitive values (prod/staging secrets)     | The crown jewels.                         | No reveal path exists at all; delivery requires a machine credential.                                  |
| Non-protected (dev) sensitive values                              | Real but lower-grade.                     | Diskless injection; the protection is disklessness, not unreadability.                                 |
| Instance root key (`INSTANCE_ROOT_KEY_V1`)                        | Unwraps every tenant data key.            | Cloudflare Secrets Store + offline sealed escrow; resident only in the Runtime deploy, request-scoped. |
| Organization / Project data keys                                  | Tenant crypto isolation.                  | Random per-tenant keys, AES-GCM wrapped under root key with tenant-binding AAD.                        |
| Provider credentials (GitHub App, Cloudflare token, Vercel OAuth) | Pivot to the customer's cloud.            | Encrypted as organization data; used server-side, never revealed.                                      |
| Audit trail                                                       | Incident reconstruction; tamper-evidence. | Hash-chained, HMAC'd, Ed25519-signed exports; metadata-only.                                           |
| Tenant metadata (names, relationships)                            | Cross-tenant enumeration, targeting.      | RLS + Tenant-Scoped Store; sensitive metadata encrypted.                                               |
| The audit-export signing key                                      | Public verifiability of exports.          | Same custody as root key (offline-generated, escrowed, Secrets Store).                                 |

### 2.2 Trust boundaries

1. **The Runtime Trust Boundary.** Once a secret is delivered into an approved child process
   as an environment variable, it is inside that process. The guarantee is about _reaching_
   the value through the product's surfaces, not about controlling the process after delivery.
2. **The decrypt-egress boundary.** Plaintext exists only inside approved modules in the
   Runtime deploy, for the span of one request. Enforced by import lint + topology.
3. **The tenant boundary.** The Organization. Three layers: application `org_id` filters,
   Postgres `FORCE ROW LEVEL SECURITY` under a `NOBYPASSRLS` role, and tenant-bound crypto.
4. **The human/machine boundary.** A human session (and any agent that inherits it) can never
   obtain a Protected Environment injection grant; that requires a machine credential the
   agent does not hold.

### 2.3 Adversaries we model

- **A1 — Local coding agent** inside a developer's authenticated session. Can run arbitrary
  shell commands, read files, call the CLI/API with the human's short-lived token. **The
  primary adversary.** Not assumed malicious, assumed _unrestrained and fast_.
- **A2 — Compromised CI job** holding a machine credential (OIDC identity or deploy key).
- **A3 — Malicious or curious tenant member** trying to exceed their role, or reach another
  tenant's data.
- **A4 — External network attacker** hitting public edges, replaying callbacks, guessing IDs.
- **A5 — Stolen credential** (session token, deploy key, provider token, remote build cache
  access).
- **A6 — Infrastructure-privileged insider** with Cloudflare account access. The boundary for
  this adversary is defined in §2.4.
- **A7 — Supply-chain attacker** poisoning a dependency or build artifact.

### 2.4 No-reveal custody, defined

insecur's central claim is **no-reveal custody**: a guarantee about the product surface. The
structural guarantee is that agents and ordinary human sessions have **no read path** — no
Secret Reveal — to Protected Environment sensitive values, and that no API, CLI, UI, or Service
Access route returns a Protected Environment plaintext to anyone. Reveal is not a feature that
is gated; it is a surface that does not exist (§3).

No-reveal custody is deliberately **not** a claim of zero-knowledge or of cryptographic
inability at the infrastructure layer. The defensible, precise claim is: **strong encryption,
no product read path, no casual access.** The product does not claim "zero-knowledge," "we
cannot decrypt," or "technically incapable of access," and marketing and contract copy are
bound by ADR-0044 to that same precision. The boundary for the infrastructure-privileged
adversary (A6) is drawn by operational controls — account-admin minimization, deploy-principal
separation, and out-of-band logging of escrow access and Secrets Store binding/role changes —
and, on the roadmap, by external-KMS / Customer-Managed Key Custody, under which the customer
holds a wrapping authority they can revoke outside insecur (ADR-0050). Self-Hosted Instances
shift root-key custody to the customer, who generates, loads, and escrows their own root key.

This precision is the point of the design, not a caveat to it: the product read path is closed
structurally, and the claim is scoped to exactly what the structure guarantees.

---

## 3. The Central Control: No Reveal by Construction

insecur separates three verbs and treats them as different risk classes:

- **Secret Use** — a secret is delivered into an approved execution (child process, provider
  sync) and used, without the _caller_ ever seeing plaintext.
- **Secret Delivery** — plaintext moves from insecur to a delivery destination (a child
  process env, or a provider's own secret store).
- **Secret Reveal** — plaintext is returned to a caller to look at. **This is the path
  insecur removes.**

Rules that make reveal structurally absent rather than merely gated:

1. **Protected Environment secrets have no reveal path at all** — not for owners, not for
   Service Access, not via break-glass. There is no API/CLI/UI/Service-Access route that
   returns one. Break-glass may allow _delivery_, rotation, replacement, reauthorization, or
   rollback, but never plaintext disclosure.
2. **Sensitive values may never appear** in default API/CLI/UI output, JSON, logs, audit
   metadata, operation payloads, queue payloads, telemetry, or agent-facing output. Only
   modules on the decrypt-import allowlist can produce plaintext at all, and that list is
   lint-enforced.
3. **Decrypt failure is a single opaque, fail-closed error** (`crypto.decrypt_failed`,
   `retryable: false`, no cause discriminant), so it cannot become a decryption oracle that
   distinguishes wrong-key from tampered-ciphertext from identity-mismatch.
4. **Values enter only through safe input paths** (request bodies over TLS, CLI stdin, masked
   TTY prompts, service generation, provider OAuth, or dev-only import) and are **never**
   accepted in URLs, query strings, route params, CLI arguments, or GET requests — the places
   they leak into shell history, proxy logs, and transcripts.
5. **insecur never captures child-process stdout/stderr.** It cannot re-leak what the child
   prints.
6. **Sync verification is metadata-only.** insecur never reads sensitive values _back_ from a
   provider's store even when the provider API would allow it. Sync is one-way.

Development environments are permissive by design so the agent loop stays fast. The protection
in a non-protected environment is diskless injection — the secret loads into a child process
and never lands in a persistent `.env` file — not unreadability of the injected value.

---

## 4. Defeating the Primary Adversary (A1: the local agent)

The scenario: a coding agent runs inside the developer's authenticated shell, holding the
human's short-lived `INSECUR_SESSION_TOKEN`. It can run any command. How is it kept away from
production secrets?

**Not by restraint. By possession.** (ADR-0038.)

- Runtime injection _is_ a read path: whoever controls the child process can read the env it
  was handed. So "the ability to inject is the ability to read."
- Therefore a **Protected Environment injection grant requires a machine credential bound to
  that environment** — an OIDC identity or a deploy key. That credential lives in CI/CD, where
  the agent is not. The agent holds the human's session token but never the machine credential.
- This is enforced as a **machine-only authorization scope**, not an actor-type check. The
  atom `runtime_injection:grant_issue_protected` appears in **no** built-in human role bundle
  and can be contributed **only** by machine effective-access resolution when the credential is
  bound to the target environment. A registry conformance test pins both halves of that
  invariant, so weakening it requires a visible red diff. Routes never branch on "is this an
  agent" (which an agent could spoof or a refactor could erase); they check the scope, and the
  human resolution path simply cannot produce it.
- **Minting a credential is itself a High-Assurance Challenge** action. Otherwise the agent
  would just mint its own. Agents cannot clear High-Assurance Challenges — those require fresh
  human factor verification through the web Approval Surface. An agent can _request_ one and
  hand a bounded operation ID to the human, but clearing it authorizes only that exact bounded
  operation and imports none of the clearing human's wider access.

Net effect: an agent can do everything in a non-protected dev environment (fast loop
preserved), and has **no path** to Protected Environment plaintext, because the boundary is a
credential it structurally does not possess, not a rule it is asked to follow.

Why classification is a _property_, not a name: Development is non-protected; staging and
production are Protected; **Preview defaults to Protected** and can only be opted down when its
values are confirmed non-production. The risk is asymmetric — misclassifying a real-value env
as non-protected leaks live secrets to the agent, while over-protecting a throwaway env only
adds friction — so the default favors protection.

---

## 5. Tenant Isolation (A3: cross-tenant)

Three independent layers, defense-in-depth so a single-layer bug does not cross tenants:

1. **Application layer.** All persistence goes through the **Tenant-Scoped Store**. No route,
   domain function, or caller ever receives a raw SQL executor. The store opens a short
   transaction, sets the tenant scope transaction-locally, runs the callback against a scoped
   handle, and commits. Every durable selector is an **Opaque Resource ID**, never a
   guessable/plaintext name.
2. **Database layer.** Postgres Row-Level Security with `FORCE ROW LEVEL SECURITY` under a
   `NOBYPASSRLS` runtime role. Migrations use a _distinct elevated role_; CI asserts the two
   credentials are different. Because Hyperdrive uses transaction-mode pooling, tenant scope is
   transaction-local (not session-global) and the driver must not rely on prepared statements —
   a subtle correctness/isolation requirement we call out for reviewers.
3. **Crypto layer.** Tenant-bound keys. Even with a row in hand, ciphertext will not decrypt
   under the wrong tenant's key because the AAD binds tenant identity.

Additional properties:

- **Denied authorization does not reveal cross-tenant existence** (no oracle for "does org X
  own resource Y").
- **No security-relevant read cache.** Hyperdrive query caching is disabled on the runtime
  path because revocation and authorization reads require strong consistency. Workers KV is
  banned for security-relevant state because eventual consistency is unsafe for revocation.
- **Tests run against real Postgres** as the `NOBYPASSRLS` role — never SQLite/PGlite/mocks —
  with an explicit cross-tenant regression suite (ADR-0054), plus a **no-plaintext canary
  gate** that sweeps every column of every user table and in-process console output for
  sentinel values.

---

## 6. Cryptography and Key Custody

Envelope encryption, AES-256-GCM throughout, layered keys (ADR-0005/0026/0031):

```
Instance Root Key  (Cloudflare Secrets Store, offline escrow, outside Postgres)
   └─ wraps → Organization Data Key / Project Data Key  (random per tenant, AES-GCM wrapped,
                                                          AAD = tenant identity + key version)
        └─ wraps → per-record / per-version Data Encryption Key (DEK)
             └─ encrypts → the sensitive value
```

Design choices worth reviewing:

- **Wrapped, not derived.** Data keys are independent random keys stored AES-GCM-wrapped under
  the root key. Derivation is _forbidden_ in the production keyring. This makes root rotation a
  rewrap of key blobs only: rotation never decrypts sensitive values and never rewrites record
  ciphertext.
- **Ciphertext identity binding is reconstructed, not stored.** The binding (org/project/env/
  secret identity) is recomputed from the record's own trusted Opaque Resource IDs _at decrypt
  time_, not persisted beside the ciphertext. A row relocated or swapped to impersonate another
  record fails authentication and does not decrypt — and crucially, an attacker who moves the
  row cannot move a stored binding along with it, because there is none.
- **Layer separation reconciles rollback with binding.** The ciphertext layer binds immutable
  identity and _no_ content version, so rollback is a no-decrypt ciphertext copy across
  versions of the same secret. The DEK-wrap layer binds the data-key coordinate and a format
  marker (both stored _and_ bound, so neither can be swapped nor stripped to force a weaker
  interpretation).
- **Domain separation is a record-type tag** under shared tenant keys (Secret vs Provider
  Credential vs Sensitive Metadata), not separate key hierarchies.
- **Key material is request-scoped only.** Root key, data keys, DEKs, and unlocked values are
  reachable in the Worker only for the span of the single request that needs them — never
  module-global, never in `process.env` in production. Production refuses the dev-only
  `INSECUR_INSTANCE_ROOT_KEY_HEX` fail-closed. This is _window-narrowing_, not in-process
  secrecy: during an active decrypt the plaintext is necessarily in memory (see the Runtime
  Trust Boundary).
- **Plaintext-metadata allowlist.** Any schema column not on the allowlist registry is presumed
  Sensitive Metadata and must go through the encryption envelope; a conformance gate fails
  closed on any unregistered column. Registering a column as plaintext is the explicit,
  reviewable act.

**Custody precision.** The root key and the audit-signing key share Cloudflare Secrets Store
custody. So audit signing delivers _public verifiability against outside tampering_, not
_non-repudiation against the operator_. The claim ceiling is "tamper-evident and independently
verifiable," never "tamper-proof" or "immutable."

---

## 7. How the Invariants Are Enforced (so you can check us)

Structural claims are worth nothing if a refactor can silently erase them. These run in
`pnpm verify` / CI:

| Invariant                                                        | Enforcement                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Route lives on the right deploy; Runtime has zero public routes  | `pnpm conformance:topology` (`scripts/ci/deploy-topology-conformance.mjs`)                                                      |
| Decrypt output only in allowlisted modules                       | ESLint restricted-import boundary (`eslint.config.ts`, ADR-0071)                                                                |
| Public/contract packages off the crypto graph                    | Package-boundary conformance gate                                                                                               |
| Protected injection scope is machine-only                        | Registry conformance suite in `packages/access`                                                                                 |
| No plaintext in any DB column or console                         | `pnpm test:canary` in the postgres-integration job (ADR-0069)                                                                   |
| Cross-tenant / RLS isolation                                     | Real-Postgres suite as `NOBYPASSRLS` role (ADR-0054)                                                                            |
| Unregistered column ⇒ presumed sensitive                         | Plaintext Metadata Allowlist gate (ADR-0070)                                                                                    |
| Distinct runtime vs migration DB roles                           | CI assertion                                                                                                                    |
| Supply chain                                                     | pnpm 10, blocked lifecycle scripts, `onlyBuiltDependencies` allowlist, `minimumReleaseAge`, signed remote cache (CI-write-only) |
| Audit codes / error codes / intent codes are closed vocabularies | Canonical catalogs, writer rejects unregistered codes (ADR-0068)                                                                |

---

## 8. Design Properties We Most Want Scrutinized

1. Is the **no-reveal-custody** claim (§2.4) drawn precisely — does the structure guarantee
   exactly what the language claims, and no more?
2. Is **possession-over-restraint** (§4) actually airtight, or is there a credential-minting or
   step-up path that lets an agent bootstrap a machine credential?
3. Does **reconstruct-not-store identity binding** (§6) hold under every rollback / rotation /
   rewrap path, or is there a sequence that lets ciphertext decrypt in the wrong place?
4. Are the three isolation layers (§5) genuinely independent, or do they share a failure mode
   (e.g. the pooling/prepared-statement caveat)?
5. What adversary or asset did we fail to list in §2?

Rationale for every decision lives in `docs/adr/`; the authoritative product decisions live in
`docs/specs/product-spec.md`.
