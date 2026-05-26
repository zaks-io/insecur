# Storage Security Gate

The Storage Security Gate is the readiness Module that decides whether production Secret Delivery and Secret Sync may decrypt or deliver values. It is not the encryption engine, the Keyring, the Tenant-Scoped Store, or a provider Adapter. Its Interface is a metadata-only verdict over readiness facts those deeper modules expose.

The gate exists because "encryption done" is too shallow for production delivery. Production delivery is allowed only when tenant-bound keys, ciphertext identity binding, tenant-scoped metadata storage, provider credential encryption, Sensitive Metadata encryption, and no-plaintext persistence are all implemented and verified together.

## Scope

The gate applies before production delivery paths decrypt Sensitive Values or use Provider Credentials:

- Production Secret Sync to Vercel, GitHub, and direct Cloudflare Worker secrets.
- Production Runtime Injection and other production Secret Delivery paths.
- Provider Credential use by delivery adapters.
- Protected Environment delivery, in addition to its approval, promotion, and credential-custody gates.

The gate does not:

- Permit Secret Reveal for Protected Environment secrets.
- Replace Protected Approval Policy, Promotion, Published Version, Runtime Injection Policy, Injection Grant, Sync Execution Revalidation, Explicit Provider Lookup, or High-Assurance Challenge rules.
- Replace ADR-0038's Machine Identity credential requirement for Protected Environment delivery; that custody gate is additional and orthogonal.
- Make provider secret stores part of the Secret Source of Truth; provider stores remain derived delivery targets.
- Block the local development Runtime Injection loop as a product feature flag. Non-protected local injection still depends on tenant-bound encryption of stored Secrets, but it does not require provider credentials or Secret Sync readiness.

## Hard Commitments

- Production Secret Delivery and production Secret Sync call the gate in the server-side delivery
  path immediately before decrypt, Injection Grant use, Provider Credential use, or provider write.
- `unknown` is delivery-blocking. A missing migration, missing evidence row, failed readiness
  probe, or unreachable dependency is not treated as a warning for production delivery.
- A passed setup command, deploy, migration, or release gate is evidence, not durable authority.
  Delivery attempts re-check the readiness facts they depend on.
- First Value non-protected local Runtime Injection is a carve-out only from the full production
  readiness verdict. It still uses tenant-bound encryption of stored Secrets, the Tenant-Scoped
  Store, Effective Access, Secret-Free Logging, and No Plaintext Persistence.
- The gate never creates a Secret Reveal path, never downgrades Protected Environment delivery
  rules, and never replaces Machine Identity custody for Protected Environment Runtime Injection.

## Interface

The gate returns a metadata-only readiness verdict. It must never return Sensitive Values, decrypted Sensitive Metadata, key material, Provider Credentials, raw provider bodies, child-process environments, or decrypted request bodies.

The verdict should expose:

- `status`: `passed`, `blocked`, or `unknown`. `unknown` behaves like `blocked` for production delivery.
- `scope`: the Instance, Organization, Project, Environment, App Connection, Secret Sync, or delivery attempt being checked.
- `controls`: stable control IDs with pass, block, or unknown state.
- `evidence`: metadata references such as migration versions, key version IDs, operation IDs, audit IDs, and configuration versions.
- `error`: a stable machine-readable code for delivery denial when production delivery is blocked.

The gate is checked server-side immediately before decrypt or provider write. A setup-time pass is not durable authority for a later delivery attempt.

## Readiness Controls

| Control | Must Prove | Primary Evidence |
| --- | --- | --- |
| Root key outside metadata store | Instance root key material lives outside Postgres in Cloudflare Secrets Store and is reachable by the Worker. | Secrets Store binding/configuration, root key version metadata, Keyring readiness. |
| Root key escrow | The root key has offline escrow before production use, and root rotation can re-escrow new versions. | Escrow record metadata and root rotation procedure evidence. |
| Tenant data keys | Organization Data Keys and Project Data Keys exist for the delivery scope. | Tenant-Scoped Store rows visible only under the resolved tenant scope. |
| Key versions | Key material has explicit versions and lifecycle states such as active, retired, and revoked. | Key version rows and rotation verification reports. |
| Keyring readiness | The Keyring can resolve the root, organization key, project key, and per-record key chain for the delivery scope without cross-tenant key handoff. | Keyring readiness check, tenant-scoped cache tests, cross-tenant key tests. |
| Tenant-scoped metadata store | Metadata reads and writes go through the Tenant-Scoped Store, with Postgres Row-Level Security active and no raw executor leaving the store. | ADR-0037 implementation evidence, RLS policy migrations, cross-tenant store tests. |
| Secret encryption | Secret ciphertext is encrypted under project data keys and bound to immutable organization, project, environment, and secret identity. | Envelope metadata, encryption tests, ciphertext swap tests. |
| Key-version binding | The envelope's DEK-wrap layer binds the data-key version; Secret content version is tracked in Postgres, not ciphertext AAD. | ADR-0005 amendment, ADR-0026 envelope tests, rotation tests. |
| Provider Credential encryption | Provider Credentials are encrypted under organization data keys and bound to organization, app connection, provider, credential, and key version identity. | App Connection credential rows, envelope tests, credential rotation tests. |
| Sensitive Metadata encryption | Sensitive Metadata is encrypted under tenant-bound data keys; plaintext lookup fields are limited to Opaque Resource IDs and Display Names. | Sensitive Metadata field inventory, encryption tests, search/index review. |
| No plaintext persistence | Insecur-controlled durable surfaces never store Sensitive Values, Provider Credentials, key material, or decrypted Sensitive Metadata. | Canary-value tests across Postgres, R2 backups, Queue payloads, Durable Object state, KV, audit metadata, operation records, caches, local config, logs, traces, and analytics. |
| Delivery fail-closed | Delivery paths deny production decrypt/write/inject when any required readiness control is blocked or unknown. | Secret Sync and Runtime Injection denial tests, stable error code coverage, audit events. |

## Delivery Matrix

| Path | Gate Requirement | Additional Gates |
| --- | --- | --- |
| Production Secret Sync | Required before decrypt or provider write. | App Connection, encrypted Provider Credential, Sync Execution Revalidation, Explicit Provider Lookup where required, protected delivery configuration controls, and ADR-0038 custody rules where applicable. |
| Production Runtime Injection | Required before decrypt or Injection Grant use. | Runtime Injection Policy, Runtime Injection Policy Version, exact bindings, one-use Injection Grant, Published Versions for Protected Environments. |
| Protected Environment Runtime Injection | Required. | ADR-0038 Machine Identity credential custody, Published Versions, Runtime Injection Policy, Injection Grant, Command Fingerprint where required. |
| Non-protected local Runtime Injection | Stored Secrets must still use tenant-bound encryption, but the full Storage Security Gate does not gate the local development loop. | Actor Effective Access, environment policy, Runtime Injection constraints for that environment. |
| Protected Environment Secret Reveal | Not applicable. The path must not exist and denial must happen before decrypt. | Protected Environment reveal prohibition and Service Access limits. |
| Planning, dry-run, status, and low-privilege audit output | May run without a passed delivery gate if output is metadata-only. | Sensitive Detail Gate for decrypted Sensitive Metadata, authorization, and scoped list rules. |

## Implementation Shape

The gate is deep at its Interface because every production delivery caller gets one readiness
verdict instead of re-implementing storage safety checks. Its Implementation composes readiness
facts from deeper modules:

- The Keyring exposes key-chain readiness: root reachable, tenant data keys present, key versions modeled, and tenant-scoped cache invariants holding.
- The Tenant-Scoped Store exposes metadata-store readiness: scoped transactions, active RLS policies, runtime role without `BYPASSRLS`, and no raw executor access.
- The encryption envelope exposes binding readiness: Secret, Provider Credential, and Sensitive Metadata records use the expected AAD and key-version metadata.
- Delivery adapters call the gate before production decrypt/write/inject and fail closed when the verdict is not `passed`.
- Operation records and audit events store only the verdict metadata, denied control IDs, request IDs, operation IDs, and safe delivery identifiers.

The gate must be cheap enough to run at delivery time, but it should not rely on an ambient "production is safe" flag. A successful bootstrap, migration, or setup command can provide evidence; the delivery attempt still rechecks the readiness facts it depends on.

## Test And Release Evidence

Storage Security Gate evidence belongs in the V1 security release gate:

- Cross-tenant Tenant-Scoped Store and RLS tests prove metadata isolation.
- Cross-tenant Keyring tests prove no unlocked key crosses tenant scope.
- Ciphertext swap and mis-binding tests prove encrypted Secrets, Provider Credentials, and Sensitive Metadata fail to decrypt under the wrong identity.
- Rotation tests prove retired key versions are no longer referenced and rewrap never decrypts Sensitive Values.
- Canary Sensitive Value tests prove no plaintext reaches Postgres, R2 backups, Queue payloads, Durable Object state, KV, audit metadata, operation records, caches, local config, logs, traces, or analytics.
- Provider Credential tests prove production Secret Sync cannot use unencrypted or unbound credentials.
- Sensitive Metadata tests prove plaintext indexes contain only Opaque Resource IDs and Display Names.
- Delivery denial tests prove production Secret Sync and production Runtime Injection fail closed when any control is blocked or unknown.
