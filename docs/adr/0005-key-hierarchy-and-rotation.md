# ADR-0005: Key Hierarchy And Rotation

Date: 2026-05-23

Status: Accepted

insecur will use a layered encryption model: instance root key material stored outside the Postgres metadata store, organization data keys for organization-level encrypted data and Sensitive Metadata, project data keys for project secrets, and per-record or per-version data encryption keys where useful. Organization data keys are the baseline boundary for Sensitive Metadata; project data keys may protect project-scoped Sensitive Metadata where that tighter boundary is available. Encrypted records store key version metadata, and key rotation is a first-class workflow with plan, execute, resume, verify, and audit behavior.

This model is a production delivery prerequisite. Production Secret Delivery and Secret Sync must fail closed until the [Storage Security Gate](../storage-security-gate.md) verifies the full tenant-bound storage baseline: root key placement, organization and project data keys, key versions, Tenant-Scoped Store/RLS readiness, encrypted Provider Credentials and Sensitive Metadata, ciphertext identity binding, and no-plaintext persistence.

## Consequences

This is more complex than wrapping every secret version or provider credential with one global Worker secret, but it gives tenant isolation and routine rotation. Secret encryption must bind ciphertext to organization, project, environment, secret, and the data-key version, but never the Secret content version, with AES-GCM authenticated data (see the Amendment below). Provider credential encryption must bind ciphertext to organization, app connection, provider, credential, and key version identity. Sensitive Metadata encryption must bind ciphertext to organization, project/resource when applicable, metadata type, record, field, and key version identity. Rotation should prefer rewrapping keys or DEKs rather than decrypting Sensitive Values or Sensitive Metadata.

## Amendment (2026-05-24)

ADR-0025 makes Rollback a no-decrypt ciphertext copy, which requires ciphertext to be portable across a Secret's content versions, so the Secret content version cannot be bound into authenticated data. The Secret binding above is therefore split across the envelope's two AES-GCM layers, owned by the encryption seam (ADR-0026). The ciphertext layer binds the immutable identity (organization, project, environment, secret) through Opaque Resource IDs and no version of any kind. The DEK-wrap layer binds the data-key version, so key rotation stays detectable. The Secret content version is tracked only in Postgres by the version store. "Version identity" for Secret encryption above therefore means the data-key version, not the content version. The Provider Credential and Sensitive Metadata bindings already say "key version" and are unchanged.
