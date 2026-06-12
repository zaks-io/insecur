# ADR-0028: Instance Secrets In Cloudflare Secrets Store With Offline Escrow

Date: 2026-05-24

Status: Accepted

The instance root key lives in Cloudflare Secrets Store, bound to the Worker, not as a `wrangler secret`. This supersedes `architecture.md`'s statement that instance key material is "stored as Worker secrets," while keeping ADR-0005's requirement that root material lives outside the metadata store. Every other instance-level secret consolidates into the same store: the WorkOS API key, the audit-export HMAC key (ADR-0014), and the per-Instance provider app client secrets (ADR-0022). Scattering those as Worker secrets while the root key sits in Secrets Store would be incoherent.

The root key is generated offline on a trusted machine, a sealed escrow copy is recorded first, and only then is it loaded into Secrets Store. Secrets Store is write-only after creation, so escrow cannot be done later by reading the value back. Rotation follows the same ceremony: it generates the new root key version offline, escrows it first, loads it into Secrets Store as a new versioned, named root secret, rewraps the organization and project data keys (ADR-0005) from the old version to the new, and only then retires the old version; encrypted records already carry the key version needed to select the right root secret during the window. On a Self-Hosted Instance the customer generates, loads, and escrows their own root key.

## Considered Options

- **Worker secret (`KEK_B64`)**, the pre-V1 status quo. Rejected: it couples the key to the deploy artifact and offers no CF-side access control or audit.
- **External KMS / HSM** so deploy access alone cannot decrypt tenant data. Rejected for V1: it breaks the Cloudflare-native posture (ADR-0002) and adds latency, egress, and a hard non-Cloudflare dependency.

## Consequences

Secrets Store has no per-secret, per-Worker binding ACL; binding is gated only by account role (Super Administrator or Secrets Store Deployer/Admin). So any identity that can deploy a Worker in the account can bind the root key and read it at runtime. The accepted property is therefore that deploy/account-privileged access can extract the root key; "deploy access cannot decrypt tenant data" is explicitly **not** a V1 guarantee. The Secrets Store binding is the only accepted production root-key source: ADR-0064 refuses the plaintext `INSECUR_INSTANCE_ROOT_KEY_HEX` environment fallback in production so the root key is never resident in `process.env`, and resolves it on demand through the binding rather than caching it process-global. The trigger to move the root key to external KMS is a Hosted Instance with multiple Service Access operators. Offline escrow removes the catastrophic single-point-of-loss for backups (a deleted store, lost account, or billing lapse would otherwise permanently destroy decryptability) at the cost of the key now existing in a second location that must be physically protected with out-of-band access logging.

## Amendment (2026-06-03): Rewrap operates on wrapped data keys

The record above says rotation "rewraps the organization and project data keys (ADR-0005) from the old version to the new." That is only coherent if data keys are stored wrapped under the root, which ADR-0005's 2026-06-03 amendment now makes the decided model (the pre-V1 keyring derived them and stored nothing, so there was nothing to rewrap). This amendment pins the rotation operation to that model:

1. **Generate** the new root key version offline on a trusted machine and record its sealed **escrow** copy first, the same ceremony as bootstrap; the store is write-only after creation, so escrow cannot happen after load.
2. **Load** the escrowed key into Cloudflare Secrets Store as the new versioned, named root secret; record the new root key version. The old version stays bound during the window.
3. **Rewrap** every active organization and project data key: under a tenant scope, read the wrapped blob, unwrap it with the old root version, rewrap the same data-key bytes under the new root version (AAD re-bound to the unchanged tenant identity and data-key version), and write the new blob to `wrapped_storage_ref`, recording the new `root_key_version` on the row.
4. **Retire** the old root key version once every data key has been rewrapped.

Rewrap never decrypts a Sensitive Value, Provider Credential, or Sensitive Metadata record, and never rewrites record ciphertext: the data key value is unchanged, only its wrapping root version changes. Encrypted records already carry the data-key version needed to select the right key, and the data-key row carries the root version needed to select the right root secret during the window. The rewrap is a per-tenant, RLS-scoped metadata operation that fails closed and is audited (metadata-only, no key material in audit). It is sequenced behind the ADR-0037 Drizzle restoration (INS-155, which rewrites the data-key store) and built under INS-160. The rotation **scheduler** and operator UX remain out of V1 scope; this amendment fixes only the rewrap primitive's contract so the data layer is built rewrap-ready.

## Amendment (2026-06-12): One named binding per root key version carries the rotation window

The amendment above decides that "the old version stays bound during the window" without deciding
how two live root key versions are addressed at runtime. That question was parked at the ADR index
(lean on Secrets Store's own secret versioning, or a dual-named-secret window, and how the old
version retires). This amendment decides it.

**Topology.** Each root key version is its own Cloudflare Secrets Store secret, declared as its own
Worker binding named `INSTANCE_ROOT_KEY_V{n}` in the ADR-0027 binding map. The existing unsuffixed
`INSTANCE_ROOT_KEY` binding (typed in `apps/worker/src/env.ts`, resolved in
`apps/worker/src/crypto/keyring-context.ts`, and committed to `apps/worker/wrangler.jsonc` by the
[bootstrap runbook](../runbooks/instance-root-key-bootstrap.md)'s execute step) is **renamed to
`INSTANCE_ROOT_KEY_V1`**. Pre-launch the rename is free, and one naming convention for every
version beats grandfathering an unsuffixed exception.

Two properties decide per-version secrets over reusing one secret object across versions:

1. **Escrow-before-load applies per version.** Each root key version must be an independently
   created, independently escrowed, write-only secret: the rotation ceremony generates the new
   version offline, records its sealed escrow copy first, and only then loads it — the same
   ceremony as bootstrap. Overwriting one secret object's value would interleave two versions'
   lifecycles in a single object and blur the per-version creation and escrow evidence the
   ceremony's audit record requires.
2. **The active version set must be reviewable.** Binding-level declaration puts every live
   version in the `wrangler.jsonc` diff, so the deploy that adds `INSTANCE_ROOT_KEY_V{n+1}` and the
   later deploy that removes `INSTANCE_ROOT_KEY_V{n}` are both reviewed commits — the same evidence
   shape the bootstrap runbook's `expected_audit` already records for the first binding.

The operative platform behavior is that a Worker Secrets Store binding resolves a single secret
value (`get(): Promise<string>`, the shape `SecretsStoreSecretBinding` in
`packages/crypto/src/secrets-store-root-key-provider.ts` already pins). The Worker therefore holds
versions `n` and `n+1` concurrently by holding two named secrets, one binding each: the dual named
secrets are what carry the rotation window.

**Keyring contract.**

- **Unwrap** resolves the binding named by the data-key row's recorded `root_key_version` and fails
  closed with `RootKeyNotConfiguredError` when that version has no binding.
- **Wrap** always uses `DEFAULT_ROOT_KEY_VERSION` (`packages/crypto/src/constants.ts`), which is
  redefined from "the only valid version" to **the current wrap version**. The constant is the
  single source of truth for which version new wraps use; the keyring never enumerates bindings and
  picks the highest.
- **Readiness** fails closed when the binding named by `DEFAULT_ROOT_KEY_VERSION` is absent, so a
  deploy that bumps the constant without declaring the matching binding cannot serve traffic
  half-configured.

This maps onto the numbered rotation steps above. The **Load** step's deploy declares
`INSTANCE_ROOT_KEY_V{n+1}` and bumps `DEFAULT_ROOT_KEY_VERSION` to `n + 1` together, opening the
window: new wraps use the new version while unwrap keeps honoring each row's recorded version.
**Retire** is a deploy that removes the `INSTANCE_ROOT_KEY_V{n}` binding after rewrap verification
reports zero data-key rows recording version `n`, followed by a Root Key Rotation runbook step that
destroys the escrowed copy of the retired version. Steady state is exactly one bound version, so no
new runtime seam exists outside the rotation window.

This decision is what makes the Root Key Rotation runbook — required before production by the
runbook catalog in
[security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md) and by the
[Storage Security Gate](../storage-security-gate.md)'s root-rotation evidence row — mechanically
writable instead of inventable, and it is the version-resolution contract INS-160's rewrap-ready
data layer builds the keyring against.
