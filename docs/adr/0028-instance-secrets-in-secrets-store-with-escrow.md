# ADR-0028: Instance Secrets In Cloudflare Secrets Store With Offline Escrow

Date: 2026-05-24

Status: Accepted

The instance root key lives in Cloudflare Secrets Store, bound to the Worker, not as a `wrangler secret`. This supersedes `architecture.md`'s statement that instance key material is "stored as Worker secrets," while keeping ADR-0005's requirement that root material lives outside the metadata store. Every other instance-level secret consolidates into the same store: the WorkOS API key, the audit-export HMAC key (ADR-0014), and the per-Instance provider app client secrets (ADR-0022). Scattering those as Worker secrets while the root key sits in Secrets Store would be incoherent.

The root key is generated offline on a trusted machine, a sealed escrow copy is recorded first, and only then is it loaded into Secrets Store. Secrets Store is write-only after creation, so escrow cannot be done later by reading the value back. Rotation creates a new versioned, named root secret, rewraps the organization and project data keys (ADR-0005) from the old version to the new, retires the old version, and re-escrows the new key; encrypted records already carry the key version needed to select the right root secret during the window. On a Self-Hosted Instance the customer generates, loads, and escrows their own root key.

## Considered Options

- **Worker secret (`KEK_B64`)**, the pre-V1 status quo. Rejected: it couples the key to the deploy artifact and offers no CF-side access control or audit.
- **External KMS / HSM** so deploy access alone cannot decrypt tenant data. Rejected for V1: it breaks the Cloudflare-native posture (ADR-0002) and adds latency, egress, and a hard non-Cloudflare dependency.

## Consequences

Secrets Store has no per-secret, per-Worker binding ACL; binding is gated only by account role (Super Administrator or Secrets Store Deployer/Admin). So any identity that can deploy a Worker in the account can bind the root key and read it at runtime. The accepted property is therefore that deploy/account-privileged access can extract the root key; "deploy access cannot decrypt tenant data" is explicitly **not** a V1 guarantee. The trigger to move the root key to external KMS is a Hosted Instance with multiple Service Access operators. Offline escrow removes the catastrophic single-point-of-loss for backups (a deleted store, lost account, or billing lapse would otherwise permanently destroy decryptability) at the cost of the key now existing in a second location that must be physically protected with out-of-band access logging.
