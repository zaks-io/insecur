# ADR Index

Architectural decisions for insecur live here. ADRs are intentionally short records of decisions that are costly to reverse, surprising without context, or likely to be re-litigated.

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
- [ADR-0012: Queue-Backed Sync Execution](0012-queue-backed-sync-execution.md)
- [ADR-0013: Durable Object Sync Target Serialization](0013-durable-object-sync-target-serialization.md)
- [ADR-0014: Tamper-Evident Audit Exports](0014-tamper-evident-audit-exports.md)
- [ADR-0015: Production V1 Security Baseline](0015-production-v1-security-baseline.md)
- [ADR-0016: Delivery-First Secret Egress](0016-delivery-first-secret-egress.md)
- [ADR-0017: Protected Environment Promotion And Rollback](0017-protected-environment-promotion-and-rollback.md)
- [ADR-0018: Retire Unsafe Pre-V1 Scaffold](0018-retire-unsafe-pre-v1-scaffold.md)
- [ADR-0019: Service Access Without Secret Reveal](0019-service-access-without-secret-reveal.md)
- [ADR-0020: Instance And Deployment Posture](0020-instance-and-deployment-posture.md)
- [ADR-0021: Small-Group Production First](0021-small-group-production-first.md)
- [ADR-0022: Per-Instance Provider App Registration](0022-per-instance-provider-app-registration.md)
- [ADR-0023: Cloudflare Secrets Store Sync Target](0023-cloudflare-secrets-store-sync-target.md)
- [ADR-0024: libsodium WASM For GitHub Sealed-Box Encryption](0024-libsodium-wasm-for-github-sealed-box.md)
- [ADR-0025: Secret Version Store Below Promotion](0025-secret-version-store.md)
- [ADR-0026: Encryption Envelope Below Per-Domain Wrappers](0026-encryption-envelope-below-per-domain-wrappers.md)

## Open Questions To Grill

These surfaced while grilling the encryption seam (ADR-0026) and were deferred, not decided.

- **Key resolution.** Does the encryption engine own resolution of the root key, then an Organization Data Key, then a Project Data Key, then a per-record DEK, or is resolution a distinct seam shared by the engine and the rotation workflow? Goal: no wrapper ever holds a key.
- **Rotation mechanics.** ADR-0005 owns the first-class plan/execute/resume/verify/audit rotation workflow. Open is the rewrap primitive it drives, rewrapping DEKs and keys with no plaintext as the two-layer split allows, and the granularity: rotating a Project Data Key rewraps the DEKs under it, an Organization Data Key rewraps the project keys under it, the root rewraps the organization keys.
- **Storage Security Gate readiness.** Does the gate (ADR-0005, ADR-0016) consume a readiness self-test exposed by the resolver or engine (root key placed, data keys and versions present, identity binding active), rather than re-deriving crypto state itself?
