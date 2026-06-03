# ADR-0005: Key Hierarchy And Rotation

Date: 2026-05-23

Status: Accepted

insecur will use a layered encryption model: instance root key material stored outside the Postgres metadata store, organization data keys for organization-level encrypted data and Sensitive Metadata, project data keys for project secrets, and per-record or per-version data encryption keys where useful. Organization data keys are the baseline boundary for Sensitive Metadata; project data keys may protect project-scoped Sensitive Metadata where that tighter boundary is available. Encrypted records store key version metadata, and key rotation is a first-class workflow with plan, execute, resume, verify, and audit behavior.

This model is a production delivery prerequisite. Production Secret Delivery and Secret Sync must fail closed until the [Storage Security Gate](../storage-security-gate.md) verifies the full tenant-bound storage baseline: root key placement, organization and project data keys, key versions, Tenant-Scoped Store/RLS readiness, encrypted Provider Credentials and Sensitive Metadata, ciphertext identity binding, and no-plaintext persistence.

## Consequences

This is more complex than wrapping every secret version or provider credential with one global Worker secret, but it gives tenant isolation and routine rotation. Secret encryption must bind ciphertext to organization, project, environment, secret, and the data-key version, but never the Secret content version, with AES-GCM authenticated data (see the Amendment below). Provider credential encryption must bind ciphertext to organization, app connection, provider, credential, and key version identity. Sensitive Metadata encryption must bind ciphertext to organization, project/resource when applicable, metadata type, record, field, and key version identity. Rotation should prefer rewrapping keys or DEKs rather than decrypting Sensitive Values or Sensitive Metadata.

## Amendment (2026-05-24)

ADR-0025 makes Rollback a no-decrypt ciphertext copy, which requires ciphertext to be portable across a Secret's content versions, so the Secret content version cannot be bound into authenticated data. The Secret binding above is therefore split across the envelope's two AES-GCM layers, owned by the encryption seam (ADR-0026). The ciphertext layer binds the immutable identity (organization, project, environment, secret) through Opaque Resource IDs and no version of any kind. The DEK-wrap layer binds the data-key version, so key rotation stays detectable. The Secret content version is tracked only in Postgres by the version store. "Version identity" for Secret encryption above therefore means the data-key version, not the content version. The Provider Credential and Sensitive Metadata bindings already say "key version" and are unchanged.

## Amendment (2026-06-03): Data keys are wrapped, not derived

The original record above said "Rotation should prefer rewrapping keys or DEKs rather than decrypting Sensitive Values or Sensitive Metadata." That promise only holds if organization and project data keys are **independent random keys stored wrapped under the root key**, because rewrap means re-encrypting the wrapped key blob under a new root version without ever touching the data key's plaintext value or any record ciphertext.

The pre-V1 keyring instead **HKDF-derived** each data key from `(root key, resource id, version)` on every use and stored no key material. Under derivation there is nothing to rewrap: changing the root changes every derived data key, which would force decrypting and re-encrypting every record — the exact thing this ADR says rotation must avoid. The derive model and the rewrap promise are mutually exclusive, and the rewrap promise wins.

The decided model is therefore **wrapped data keys**:

- An organization or project data key is a random `DATA_KEY_LENGTH`-byte key generated once at provisioning.
- It is stored **AES-GCM wrapped under the instance root key** at the root key's then-current version. The wrap's AAD binds the key's tenant identity and the data-key version so a wrapped blob cannot be moved across organizations, projects, or versions.
- The wrapped blob is stored **inline** in the existing `wrapped_storage_ref` column on `organization_data_keys` / `project_data_keys`. It is small (key bytes + IV + tag); a separate blob store is needless indirection and is not used. The column name is retained; "ref" now means the inline wrapped material.
- Read path **unwraps** under the recorded root key version. Derivation (`deriveKeyMaterial`) is removed from the production keyring.
- **Rotation** mints a new root key version, unwraps each data key under the old root version, rewraps it under the new version, writes the new blob, and retires the old data-key version's root binding. The data key value is unchanged, so **no Secret, Provider Credential, or Sensitive Metadata ciphertext is rewritten** — record ciphertext continues to decrypt under the same (unchanged) data key. This is what makes rotation a metadata-only, no-decrypt-of-values operation.

This supersedes the "prefer rewrapping … rather than decrypting" phrasing from a preference into a hard invariant: rotation MUST NOT decrypt Sensitive Values or Sensitive Metadata. The implementation is sequenced behind the ADR-0037 Drizzle restoration (INS-155) because it rewrites the data-key store; see ADR-0028's matching amendment for the rotation operation and INS-160 for the build.
