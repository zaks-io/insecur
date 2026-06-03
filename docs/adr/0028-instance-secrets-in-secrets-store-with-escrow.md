# ADR-0028: Instance Secrets In Cloudflare Secrets Store With Offline Escrow

Date: 2026-05-24

Status: Accepted

The instance root key lives in Cloudflare Secrets Store, bound to the Worker, not as a `wrangler secret`. This supersedes `architecture.md`'s statement that instance key material is "stored as Worker secrets," while keeping ADR-0005's requirement that root material lives outside the metadata store. Every other instance-level secret consolidates into the same store: the WorkOS API key, the audit-export HMAC key (ADR-0014), and the per-Instance provider app client secrets (ADR-0022). Scattering those as Worker secrets while the root key sits in Secrets Store would be incoherent.

The root key is generated offline on a trusted machine, a sealed escrow copy is recorded first, and only then is it loaded into Secrets Store. Secrets Store is write-only after creation, so escrow cannot be done later by reading the value back. Rotation creates a new versioned, named root secret, rewraps the organization and project data keys (ADR-0005) from the old version to the new, retires the old version, and re-escrows the new key; encrypted records already carry the key version needed to select the right root secret during the window. On a Self-Hosted Instance the customer generates, loads, and escrows their own root key.

## Considered Options

- **Worker secret (`KEK_B64`)**, the pre-V1 status quo. Rejected: it couples the key to the deploy artifact and offers no CF-side access control or audit.
- **External KMS / HSM** so deploy access alone cannot decrypt tenant data. Rejected for V1: it breaks the Cloudflare-native posture (ADR-0002) and adds latency, egress, and a hard non-Cloudflare dependency.

## Consequences

Secrets Store has no per-secret, per-Worker binding ACL; binding is gated only by account role (Super Administrator or Secrets Store Deployer/Admin). So any identity that can deploy a Worker in the account can bind the root key and read it at runtime. The accepted property is therefore that deploy/account-privileged access can extract the root key; "deploy access cannot decrypt tenant data" is explicitly **not** a V1 guarantee. The Secrets Store binding is the only accepted production root-key source: ADR-0064 refuses the plaintext `INSECUR_INSTANCE_ROOT_KEY_HEX` environment fallback in production so the root key is never resident in `process.env`, and resolves it on demand through the binding rather than caching it process-global. The trigger to move the root key to external KMS is a Hosted Instance with multiple Service Access operators. Offline escrow removes the catastrophic single-point-of-loss for backups (a deleted store, lost account, or billing lapse would otherwise permanently destroy decryptability) at the cost of the key now existing in a second location that must be physically protected with out-of-band access logging.

## Amendment (2026-06-03): Rewrap operates on wrapped data keys

The record above says rotation "rewraps the organization and project data keys (ADR-0005) from the old version to the new." That is only coherent if data keys are stored wrapped under the root, which ADR-0005's 2026-06-03 amendment now makes the decided model (the pre-V1 keyring derived them and stored nothing, so there was nothing to rewrap). This amendment pins the rotation operation to that model:

1. **Mint** a new versioned, named root secret in Cloudflare Secrets Store; record the new root key version. The old version stays bound during the window.
2. **Rewrap** every active organization and project data key: under a tenant scope, read the wrapped blob, unwrap it with the old root version, rewrap the same data-key bytes under the new root version (AAD re-bound to the unchanged tenant identity and data-key version), and write the new blob to `wrapped_storage_ref`, recording the new `root_key_version` on the row.
3. **Retire** the old root key version once every data key has been rewrapped, and **re-escrow** the new root key offline.

Rewrap never decrypts a Sensitive Value, Provider Credential, or Sensitive Metadata record, and never rewrites record ciphertext: the data key value is unchanged, only its wrapping root version changes. Encrypted records already carry the data-key version needed to select the right key, and the data-key row carries the root version needed to select the right root secret during the window. The rewrap is a per-tenant, RLS-scoped metadata operation that fails closed and is audited (metadata-only, no key material in audit). It is sequenced behind the ADR-0037 Drizzle restoration (INS-155, which rewrites the data-key store) and built under INS-160. The rotation **scheduler** and operator UX remain out of V1 scope; this amendment fixes only the rewrap primitive's contract so the data layer is built rewrap-ready.
