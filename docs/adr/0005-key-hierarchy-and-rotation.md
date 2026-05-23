# ADR-0005: Key Hierarchy And Rotation

Date: 2026-05-23

Status: Accepted

insecur will use a layered encryption model: instance root key material stored outside D1, organization data keys for organization-level encrypted data and Sensitive Metadata, project data keys for project secrets, and per-record or per-version data encryption keys where useful. Organization data keys are the baseline boundary for Sensitive Metadata; project data keys may protect project-scoped Sensitive Metadata where that tighter boundary is available. Encrypted records store key version metadata, and key rotation is a first-class workflow with plan, execute, resume, verify, and audit behavior.

This model is a production delivery prerequisite. Secret Sync and Runtime Injection may be built for scaffold validation, but production delivery must fail closed until the Storage Security Gate verifies root key placement, organization and project data keys, key versions, provider credentials and Sensitive Metadata encrypted under tenant-bound data keys, and authenticated-data binding for encrypted secret, provider credential, and Sensitive Metadata records.

## Consequences

This is more complex than wrapping every secret version or provider credential with one global Worker secret, but it gives tenant isolation and routine rotation. Secret encryption must bind ciphertext to organization, project, environment, secret, and version identity with AES-GCM authenticated data. Provider credential encryption must bind ciphertext to organization, app connection, provider, credential, and key version identity. Sensitive Metadata encryption must bind ciphertext to organization, project/resource when applicable, metadata type, record, field, and key version identity. Rotation should prefer rewrapping keys or DEKs rather than decrypting plaintext secret values, provider credentials, or Sensitive Metadata.
