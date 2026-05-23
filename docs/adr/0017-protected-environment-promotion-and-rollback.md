# ADR-0017: Protected Environment Promotion And Rollback

Date: 2026-05-23

Status: Accepted

Protected Environment secret changes require explicit Promotion before they affect Secret Sync or Runtime Injection. Setting a secret in a Protected Environment creates a Draft Version. Promotion makes a version the Published Version eligible for protected delivery.

Rollback is supported without revealing plaintext. Emergency rollback creates a new Secret Version from a retained encrypted prior Published Version and promotes that new version. Older values are retained only as encrypted Secret Versions, never as plaintext backup copies.

Rollback eligibility is controlled by a configurable Rollback Retention Window. Once an older Published Version is outside the retention window or cryptographically unavailable, it is no longer rollback-eligible.

## Consequences

Production delivery does not change just because a value was edited. This reduces accidental provider sync, deploy, and agent exposure.

Promotion, rollback, retention changes, and retention expiry must be audited. Runtime Injection and Secret Sync for Protected Environments must load Published Versions only and must never deliver Draft Versions.
