# ADR-0009: WorkOS MFA Without SMS

Date: 2026-05-23

Status: Accepted

insecur will use WorkOS for human MFA and will not support SMS as a primary or recovery MFA factor. This favors phishing-resistant or authenticator-app based human verification over phone-number control for a product that protects production secrets.

## Consequences

Initial MFA should use WorkOS AuthKit passkeys or TOTP. High-risk human actions need a High-Assurance Challenge: a fresh passkey/TOTP challenge or equivalent high-assurance session. This gate applies to Approval Request approval, Protected Environment Promotion and rollback, Secret Import into a Protected Environment, Runtime Injection Policy changes for Protected Environments, App Connection create/reauthorization/scope changes, Protected Environment Secret Sync enable/manual run, repository-scoped GitHub overrides, protected Shared Secret Source attachment, Protected Approval Policy changes, and mutating Service Access controls. Recovery must use non-SMS mechanisms such as recovery codes, organization-owner recovery, or an audited break-glass process.
