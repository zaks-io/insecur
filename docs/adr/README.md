# ADR Index

Architectural decisions for insecur live here. ADRs are intentionally short records of decisions that are costly to reverse, surprising without context, or likely to be re-litigated.

Implementation starts from the consolidated specs in [../specs/README.md](../specs/README.md).
Use this index for traceability and rationale after locating the relevant spec section.

## Accepted

- [ADR-0001: Tenant-First Control Plane](0001-tenant-first-control-plane.md)
- [ADR-0002: Cloudflare-Native Focused Stack](0002-cloudflare-native-focused-stack.md)
- [ADR-0003: Human Authentication And Authorization](0003-human-authentication-and-authorization.md)
- [ADR-0004: Machine Identities And CI Auth](0004-machine-identities-and-ci-auth.md)
- [ADR-0005: Key Hierarchy And Rotation](0005-key-hierarchy-and-rotation.md)
- [ADR-0006: App Connections And Secret Syncs](0006-app-connections-and-secret-syncs.md)
- [ADR-0007: Developer-First CLI Contract](0007-developer-first-cli-contract.md)
- [ADR-0008: Security Gates And Runbooks](0008-security-gates-and-runbooks.md)
- [ADR-0009: WorkOS MFA Without SMS](0009-workos-mfa-without-sms.md)
- [ADR-0010: WorkOS AuthKit For Human Authentication](0010-workos-authkit-for-human-authentication.md)
- [ADR-0011: Provider Connection Method Matrix](0011-provider-connection-method-matrix.md)
- [ADR-0014: Tamper-Evident Audit Exports](0014-tamper-evident-audit-exports.md)
- [ADR-0015: Production V1 Security Baseline](0015-production-v1-security-baseline.md)
- [ADR-0016: Delivery-First Secret Egress](0016-delivery-first-secret-egress.md)
- [ADR-0017: Protected Environment Promotion And Rollback](0017-protected-environment-promotion-and-rollback.md)
- [ADR-0018: Retire Unsafe Pre-V1 Scaffold](0018-retire-unsafe-pre-v1-scaffold.md)
- [ADR-0019: Service Access Without Secret Reveal](0019-service-access-without-secret-reveal.md)
- [ADR-0020: Instance And Deployment Posture](0020-instance-and-deployment-posture.md)
- [ADR-0021: Small-Group Production First](0021-small-group-production-first.md)
- [ADR-0022: Per-Instance Provider App Registration](0022-per-instance-provider-app-registration.md)
- [ADR-0024: libsodium WASM For GitHub Sealed-Box Encryption](0024-libsodium-wasm-for-github-sealed-box.md)
- [ADR-0025: Secret Version Store Below Promotion](0025-secret-version-store.md)
- [ADR-0026: Encryption Envelope Below Per-Domain Wrappers](0026-encryption-envelope-below-per-domain-wrappers.md)
- [ADR-0027: Shared-Instance Topology And Binding Map](0027-shared-instance-topology-and-binding-map.md)
- [ADR-0028: Instance Secrets In Cloudflare Secrets Store With Offline Escrow](0028-instance-secrets-in-secrets-store-with-escrow.md)
- [ADR-0029: Single-Account Environments And CD Trust Model](0029-environments-and-cd-trust-model.md)
- [ADR-0030: Hybrid Allowlisted Operational Telemetry](0030-hybrid-allowlisted-telemetry.md)
- [ADR-0031: Keyring Below The Encryption Engine](0031-keyring-below-the-encryption-engine.md)
- [ADR-0032: Agent Execution In The Human Session With First-Class Step-Up](0032-agent-session-execution-and-step-up.md)
- [ADR-0033: Staged Change Set And Single Publish Gate](0033-staged-change-set-and-publish.md)
- [ADR-0034: Authorization Through A Single Effective Access Resolver](0034-effective-access-resolver.md)
- [ADR-0035: Display Name Resolution With A Destructive Carve-Out](0035-display-name-resolution.md)
- [ADR-0036: Neon Postgres Behind Hyperdrive With Row-Level Security](0036-neon-postgres-over-hyperdrive-with-rls.md)
- [ADR-0037: Tenant-Scoped Bound Store Over Row-Level Security](0037-tenant-scoped-bound-store-over-rls.md)
- [ADR-0038: Protected Environment Delivery Requires A Machine Credential](0038-protected-delivery-requires-machine-credential.md)
- [ADR-0039: Cloudflare Worker Secrets Sync Target](0039-cloudflare-worker-secrets-sync-target.md)
- [ADR-0040: Guided Personal Organization Provisioning](0040-guided-personal-organization-provisioning.md)
- [ADR-0041: First Value Before Production Delivery](0041-first-value-before-production-delivery.md)
- [ADR-0042: Policy-Gated Delivery Channels](0042-policy-gated-delivery-channels.md)
- [ADR-0043: Delivery Risk Policy Presets](0043-delivery-risk-policy-presets.md)
- [ADR-0044: No-Reveal Custody Is A Product-Surface Guarantee](0044-no-reveal-custody-is-a-product-surface-guarantee.md)
- [ADR-0045: Asymmetric Signing For Audit Exports In V1](0045-asymmetric-signing-for-audit-exports-in-v1.md)
- [ADR-0046: US Residency Claim Scoped To Data At Rest](0046-us-residency-claim-scoped-to-data-at-rest.md)
- [ADR-0047: Regulated-Industry Exclusion By Contract And Attestation](0047-regulated-industry-exclusion-by-contract-and-attestation.md)
- [ADR-0048: Breach Forensic Record Separate From Product Audit Retention](0048-breach-forensic-record-separate-from-audit-retention.md)
- [ADR-0049: Vendor Ports And Adapters](0049-vendor-ports-and-adapters.md)
- [ADR-0050: Customer-Managed Key Custody](0050-customer-managed-key-custody.md)
- [ADR-0051: Web Console Architecture](0051-web-console-architecture.md)
- [ADR-0052: Web No-Reveal Boundary And Management Parity](0052-web-no-reveal-boundary-and-management-parity.md)
- [ADR-0053: Remote Build Cache Trust Model](0053-remote-build-cache-trust-model.md)
- [ADR-0054: Tenant-Isolation Tests Run Against Real Postgres](0054-tenant-isolation-tests-real-postgres.md)
- [ADR-0055: ESLint And Prettier Type-Aware Toolchain](0055-eslint-prettier-type-aware-toolchain.md)
- [ADR-0056: Supply-Chain Hardening Posture](0056-supply-chain-hardening-posture.md)
- [ADR-0057: Inline Sync Execution and Partial-Failure Model](0057-inline-sync-execution-and-partial-failure-model.md)
- [ADR-0058: Minimal Backup and Tested Restore for V1](0058-minimal-backup-and-tested-restore.md)
- [ADR-0059: Tenant-Reported Secret Compromise Response](0059-tenant-reported-secret-compromise-response.md)
- [ADR-0060: Postgres 17 Development Baseline](0060-postgres-17-development-baseline.md)
- [ADR-0061: Blacksmith Runners For GitHub Actions](0061-blacksmith-github-actions-runners.md)
- [ADR-0062: Package-Seam Failures Are ErrorBody-Compatible](0062-package-seam-failures-are-errorbody-compatible.md)
- [ADR-0063: Guided Provisioning Creates, Does Not Reconcile](0063-guided-provisioning-creates-does-not-reconcile.md)
- [ADR-0064: Minimize The Secret-Resident Surface In The Worker Process](0064-minimize-secret-resident-surface.md)
- [ADR-0065: Test Layers And Preview-Env Smoke](0065-test-layers-and-preview-smoke.md)
- [ADR-0066: Operation Idempotency Key Contract](0066-operation-idempotency-key-contract.md)
- [ADR-0067: Documentation Content Ownership And The Single-Statement Rule](0067-documentation-content-ownership-and-single-statement-rule.md)
- [ADR-0068: Stable Dotted-Code Vocabularies Live In Canonical Catalogs](0068-stable-dotted-code-vocabularies-in-canonical-catalogs.md)
- [ADR-0069: No-Plaintext Canary Gate](0069-no-plaintext-canary-gate.md)
- [ADR-0070: Plaintext Metadata Allowlist Registry And Conformance Gate](0070-plaintext-metadata-allowlist-registry-and-conformance-gate.md)
- [ADR-0071: Decrypt-Egress Import Boundary](0071-decrypt-egress-import-boundary.md)
- [ADR-0072: Backup Export Pipeline And Freshness Contract](0072-backup-export-pipeline-and-freshness.md)
- [ADR-0073: Operation Execution Liveness And Abandonment](0073-operation-execution-liveness-and-abandonment.md)
- [ADR-0074: Injection Grant Lifecycle And Revocation](0074-injection-grant-lifecycle-and-revocation.md)
- [ADR-0075: Orphan Cleanup Is A New Operation](0075-orphan-cleanup-is-a-new-operation.md)
- [ADR-0076: Lazy Lifecycle Expiry And Retained Published Version Disposal](0076-lazy-lifecycle-expiry-and-retained-version-disposal.md)
- [ADR-0077: Capability-Isolated Worker Deploys](0077-capability-isolated-worker-deploys.md)
- [ADR-0078: Public Site Worker Separate From Web Console BFF](0078-public-site-worker.md)

## Superseded

- [ADR-0012: Queue-Backed Sync Execution](0012-queue-backed-sync-execution.md), superseded by [ADR-0057](0057-inline-sync-execution-and-partial-failure-model.md) (Cloudflare Queues deferred past V1)
- [ADR-0013: Durable Object Sync Target Serialization](0013-durable-object-sync-target-serialization.md), superseded by [ADR-0057](0057-inline-sync-execution-and-partial-failure-model.md) (Durable Objects deferred past V1)
- [ADR-0023: Cloudflare Secrets Store Sync Target](0023-cloudflare-secrets-store-sync-target.md), superseded by [ADR-0039](0039-cloudflare-worker-secrets-sync-target.md)

## Open Questions To Grill

These surfaced while grilling infrastructure (ADR-0027 through ADR-0030) and were deferred, not decided.

- **Rate-limit primitive.** Deferred with public onboarding. Postgres counter rows suffice for V1's few unauthenticated endpoints; a dedicated primitive (Durable Object or external) is only forced when broad public signup and its abuse controls land.
- **External telemetry sink specifics.** ADR-0030 fixes the hybrid shape and the allowlist contract but not the vendor. Axiom is the lean choice for the metadata-only stream; Sentry is permitted only with default PII, request-data, breadcrumb, and local-variable capture disabled. Final sink selection and its subprocessor review are open.
