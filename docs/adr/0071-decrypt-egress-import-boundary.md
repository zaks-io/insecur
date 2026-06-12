# ADR-0071: Decrypt-Egress Import Boundary

Date: 2026-06-12

Status: Accepted

## Decision

"Approved execution path" becomes a structural definition instead of a prose phrase. The no-reveal
egress chain bottoms out on it in four authoritative places:
[ADR-0016](0016-delivery-first-secret-egress.md) allows Sensitive Values to exist only "inside
approved execution paths", [ADR-0026](0026-encryption-envelope-below-per-domain-wrappers.md) states
that "the only plaintext that crosses the boundary outward is the output of decrypt, into an
approved execution path", and [product-spec section 5](../specs/product-spec.md), the
[agent-workstreams](../specs/agent-workstreams.md) W3 Encryption Envelope seam row, and the
CONTEXT.md Encryption Envelope module entry repeat the phrase normatively. Nothing checks it. This
ADR references, and does not amend, ADR-0016 and ADR-0026: the seam and its egress invariant are
unchanged; this record defines what "approved" means and makes the definition enforceable.

A module outside `packages/crypto` is an approved execution path if and only if it is on the
decrypt-import allowlist. The allowlist enumerates the modules permitted to import the decrypt
entry points of `@insecur/crypto`'s per-domain wrappers — `decryptSecretValueForRuntime` (Secrets),
`decryptProviderCredentialForProviderUse` (Provider Credentials), and
`decryptSensitiveMetadataForAuthorizedRead` (Sensitive Metadata), whether imported through the
package index or by deep path into the wrapper modules — and is enforced by an ESLint
restricted-import/boundary config block: the rule forbids those imports workspace-wide in non-test
source, with file-scoped overrides for exactly the allowlisted modules. This is the lint-as-gate
pattern [ADR-0055](0055-eslint-prettier-type-aware-toolchain.md) already established for complexity
budgets — deterministic, caller-agnostic, grep-auditable, failing closed in the existing `lint`
task inside `pnpm verify`, CI, and pre-push. Per
[ADR-0065](0065-test-layers-and-preview-smoke.md), that is a check inside existing gates, not a new
test layer. The restricted-import block in `eslint.config.ts` is the allowlist of record. Adding an
approved execution path is an allowlist diff plus an ADR trace, never a code-only change.

Implementation note: this ADR decides the boundary, but the lint enforcement is not wired in the
current repo state. `eslint.config.ts` still carries only the existing complexity and size gates;
the restricted-import block and the plaintext handle are follow-up implementation.

Today the allowlist has exactly one entry: runtime-injection's decrypt-for-grant path,
`packages/runtime-injection/src/decrypt-grant-secret.ts`, which imports
`decryptSecretValueForRuntime` to decrypt a consumed Injection Grant's bound secret version. Two
future entries are decided V1 work and are added as deliberate allowlist diffs with their own ADR
trace when built: W8 Secret Sync write execution (Provider Credential decrypt for provider use,
plus Secret value decrypt after Sync Execution Revalidation and immediately before provider write,
per ADR-0016) and the Sensitive Detail Gate's authorized Sensitive Metadata decrypt (W2/W9).
Building either workstream without touching the allowlist fails lint; that failure is the boundary
working as intended.

Rotation and rewrap are deliberately absent from the allowlist. Product-spec section 5 and
[ADR-0031](0031-keyring-below-the-encryption-engine.md) mandate that rotation and rewrap never
decrypt Sensitive Values, Provider Credentials, or Sensitive Metadata: rewrap transiently unwraps
key material at the DEK-wrap layer while value ciphertext stays sealed. ADR-0016's "rotation
workflows" in its approved-paths sentence means value-rotation — producing and encrypting a new
Secret Version — which is encrypt-side and needs no decrypt import. Rewrap's absence from the
allowlist is the boundary encoding the spec, not an omission.

`eslint-disable` of the boundary rule is prohibited in non-test source. ADR-0055's allowance for a
justified inline disable of a size budget does not extend to this rule, because a disable comment
is exactly the code-only bypass the allowlist exists to prevent; the only sanctioned exception
mechanism is an allowlist diff in `eslint.config.ts`, visible as a config change in review. Test
files may exercise the decrypt entry points directly.

Decrypt output is additionally carried in a minimal plaintext handle whose `toJSON` throws. This is
a secondary tripwire with documented limits, not the boundary itself: it cannot stop code that
extracts the raw bytes early and passes them around; it only turns an accidental `JSON.stringify`
of a structure still holding the handle — which for a bare `Uint8Array` silently yields an
index-keyed object today — into a loud failure the integration and e2e suites can catch. The lint
allowlist is the load-bearing mechanism. The handle is unwrapped at a single named egress
consumption point: child-process environment construction in the CLI injection path, ADR-0016's v1
Runtime Injection wrapper that fork/execs the approved child with environment variables.
Reconciling with today's code, where grant consume runs in the Worker and the wrapper runs in the
CLI process: the handle slots into `consumeInjectionGrant`'s `valueUtf8` result field in
`packages/runtime-injection/src/consume-injection-grant.ts`, and the Worker-side handle is consumed
exactly once, at the runtime delivery envelope's base64url encoding in
`apps/worker/src/http/runtime-delivery-envelope.ts`, whose sole purpose is to carry the value over
TLS to that CLI consumption point for immediate process injection.

## Options Considered

- **Keep the prose definition and per-surface vigilance.** Rejected. ADR-0016's surface list
  ("default API, CLI, UI, JSON, logs ... must not return Sensitive Values") depends on every author
  of every new surface re-reading prose; at fleet scale "approved" degrades to "whatever got
  merged". ADR-0055 already rejected this pattern for size budgets: review is advisory and
  non-deterministic, while a linted gate fails closed and applies to every author identically.
- **A dependency-analysis tool or bespoke architectural test.** Rejected. A dependency-cruiser
  config or a unit test enumerating importers would be a second tool and second source of truth for
  the same fact; ESLint already runs type-aware over the whole workspace in the blocking `verify`
  path, so the allowlist lives where the enforcement is.
- **Stop exporting the decrypt entry points, or split them into an "unsafe" subpath.** Rejected. A
  packaging split still needs a list of who may import the subpath, so it adds an export seam
  without removing the allowlist, and it breaks the one legitimate consumer for no enforcement
  gain.
- **Make the non-serializable handle the boundary.** Rejected as the primary mechanism. Runtime
  wrapping is defeated by extracting the raw bytes at the first touch, and a tripwire that fires
  only when serialization happens to occur is vigilance with extra steps. It is kept strictly as a
  secondary tripwire under the lint boundary.

## Consequences

- The normative definition propagates to [product-spec](../specs/product-spec.md) sections 5 and 6,
  the [agent-workstreams](../specs/agent-workstreams.md) W3 seam row, and CONTEXT.md as: approved
  execution paths are the modules on the decrypt-import allowlist enforced by the lint boundary;
  the restricted-import block in `eslint.config.ts` is the allowlist of record; adding a path is an
  allowlist diff plus ADR trace, not a code-only change.
- [docs/storage-security-gate.md](../storage-security-gate.md) gains a single cross-reference line
  to this ADR. The gate remains storage-readiness evidence; egress-path enumeration lives here.
- `eslint.config.ts` currently carries complexity and size budgets only; the restricted-import
  block and the throwing-`toJSON` handle are follow-up implementation of this contract. Until the
  block lands, the enumeration in this ADR is the allowlist.
- [ADR-0059](0059-tenant-reported-secret-compromise-response.md)'s deferred Leak Verification
  primitive decrypts candidate Secrets in an approved execution path; if promoted from deferred
  scope it becomes an allowlist diff plus ADR trace like any other entry.
- [ADR-0064](0064-minimize-secret-resident-surface.md) bounds how long decrypted material is
  reachable and disclaims in-process secrecy ("window-narrowing"); this ADR owns the complementary
  question of which modules may produce decrypt plaintext at all. Together they leave the residual
  in-request window to the no-untrusted-code posture, Secret-Free Logging, and the Storage Security
  Gate, as ADR-0064 already records.
