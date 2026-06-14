# Cryptography, Storage, And Audit

Glossary slice for agents. Term definitions are authoritative here and single-sourced;
do not copy them into package context files. Index and routing: [`../../../CONTEXT.md`](../../../CONTEXT.md).
Term relationships: [`../relationships.md`](../relationships.md). Usage examples: [`../dialogue.md`](../dialogue.md).

## Cryptography, Storage, And Audit

**Organization Data Key**:
Encryption material scoped to organization-owned sensitive data.
_Avoid_: tenant key

**Project Data Key**:
Encryption material scoped to project secret data.
_Avoid_: secret key when referring to encryption material

**Key Version**:
A specific piece of key material tracked through its lifecycle.
_Avoid_: key revision

**Key Rotation**:
A planned key lifecycle event that replaces key material or provider authorization material.
_Avoid_: rekey when discussing the broader workflow

**Customer-Managed Key Custody**:
An Organization-scoped Key Custody mode on a Hosted Instance where the Organization supplies a customer-controlled wrapping authority and grants insecur runtime limited use of it for that Organization's data-key chain.
_Avoid_: BYOK when implying raw key upload; zero-knowledge when insecur runtime can still perform authorized delivery

**Custody-Locked Organization**:
An Organization whose configured Key Custody root is unavailable or revoked, so decrypting operations fail closed while non-decrypting navigation, status, audit, and recovery surfaces remain available.
_Avoid_: deleted organization, suspended organization when the cause is key custody availability

**Keyring**:
The component that resolves the key hierarchy from the configured Key Custody root through the relevant Organization or Project Data Key to the per-record key, holds unlocked keys briefly in a tenant-scoped cache, and exposes the single rewrap primitive that Key Rotation drives at every level. In the shared-database Instance it bounds the Sensitive Values, while Row-Level Security under the **Tenant-Scoped Store** bounds the metadata rows; together they form the tenant-isolation boundary.
_Avoid_: key store when the resolving and rewrapping component is meant

**Encryption Envelope**:
The domain-agnostic cryptographic Module that wraps and unwraps Sensitive Values, Provider Credentials, and Sensitive Metadata using trusted Opaque Resource IDs for identity binding, returning wrapped material to callers and allowing decrypt output only into approved execution paths, which are the modules on the decrypt-import allowlist enforced by the lint boundary per [ADR-0071](../../adr/0071-decrypt-egress-import-boundary.md).
_Avoid_: per-domain secret wrapper when the shared cryptographic Interface is meant

**Tenant-Scoped Store**:
The single persistence seam through which all metadata reads and writes pass. A caller provides a structural scope derived from the resolved actor and a callback; the store opens one short transaction, sets the tenant scope transaction-local so Row-Level Security enforces it, and runs the callback against a scoped handle, never exposing a raw executor. **Organization Access** scopes it to one **Organization**'s rows and **Service Access** opens the audited cross-Organization path. With the **Keyring** it forms the tenant-isolation boundary in the shared-database Instance: it bounds the metadata rows, the keyring bounds the values.
_Avoid_: repository, DAO, raw query when the scoped transactional seam is meant

**Ciphertext Identity Binding**:
The rule that an encrypted Secret, Provider Credential, or Sensitive Metadata record is cryptographically bound to the Opaque Resource IDs of the record it belongs to, recomputed from the record's own identity at decrypt rather than stored with the ciphertext, so a relocated or swapped record fails to decrypt.
_Avoid_: stored identity tag, since the binding is recomputed from the record and never persisted with it

**Storage Security Gate**:
The required tenant-bound storage readiness baseline that must be implemented and verified before production Secret Delivery or Secret Sync can run. Its canonical readiness contract lives in `docs/storage-security-gate.md`.
_Avoid_: encryption done when the full storage baseline is meant; "production Runtime Injection" as if it gated the local development Runtime Injection loop, storage is ready for the required tenant-bound encryption baseline for Secrets, Provider Credentials, and Sensitive Metadata

**Audit Log**:
An append-only history of meaningful authenticated actions and authorization denials.
_Avoid_: event log when the security record is meant

**Audit Event Writer**:
The Module that writes typed, tenant-qualified, metadata-only Audit Log entries and denied-action records while enforcing Sensitive Value and Sensitive Metadata safety rules for audit payloads.
_Avoid_: logger, telemetry emitter, free-form event sink

**Audit Export**:
A tenant-bounded artifact containing audit log entries for a time range.
_Avoid_: report when the exported evidence artifact is meant

**Breach Forensic Record**:
The combined record used to investigate and scope a security incident, broader than the Audit Log: it spans the product Audit Log, Cloudflare account and Secrets Store infrastructure logs, and the out-of-band escrow-access log. It is retained on a fixed floor independent of product audit retention tiers.
_Avoid_: audit log when the broader incident record is meant
