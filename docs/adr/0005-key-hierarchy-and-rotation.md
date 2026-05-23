# ADR-0005: Key Hierarchy And Rotation

Date: 2026-05-23

Status: Accepted

insecur will use a layered encryption model: instance root key material stored outside D1, organization data keys for organization-level encrypted data, project data keys for project secrets, and per-record or per-version data encryption keys where useful. Encrypted records store key version metadata, and key rotation is a first-class workflow with plan, execute, resume, verify, and audit behavior.

## Consequences

This is more complex than wrapping every secret version with one global Worker secret, but it gives tenant isolation and routine rotation. Secret encryption must bind ciphertext to organization, project, environment, secret, and version identity with AES-GCM authenticated data. Rotation should prefer rewrapping keys or DEKs rather than decrypting plaintext secret values.
