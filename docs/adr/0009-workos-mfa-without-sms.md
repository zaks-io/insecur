# ADR-0009: WorkOS MFA Without SMS

Date: 2026-05-23

Status: Accepted

insecur will use WorkOS for human MFA and will not support SMS as a primary or recovery MFA factor. This favors phishing-resistant or authenticator-app based human verification over phone-number control for a product that protects production secrets.

## Consequences

Initial MFA should use WorkOS AuthKit passkeys or TOTP. High-risk human actions still need a fresh MFA challenge or equivalent high-assurance session. Recovery must use non-SMS mechanisms such as recovery codes, organization-owner recovery, or an audited break-glass process.
