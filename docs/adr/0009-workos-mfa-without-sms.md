# ADR-0009: WorkOS MFA Without SMS

Date: 2026-05-23

Status: Accepted

insecur will use WorkOS for human MFA and will not support SMS as a primary or recovery MFA factor. This favors phishing-resistant or authenticator-app based human verification over phone-number control for a product that protects production secrets.

## Consequences

Initial MFA should use WorkOS AuthKit passkeys or TOTP. High-risk human actions need a High-Assurance Challenge: a fresh factor verification (passkey or TOTP) at challenge time, completed on the Human Approval Surface; login-time MFA, session age, or session attributes never satisfy it, and clearing it grants no reusable authority (ADR-0032; see the Amendment below). This gate applies to Approval Request approval, Protected Environment Promotion and rollback, Runtime Injection Policy changes for Protected Environments, App Connection create/reauthorization/scope changes, Protected Environment Secret Sync enable/manual run, repository-scoped GitHub overrides, protected Shared Secret Source attachment, Protected Approval Policy changes, and mutating Service Access controls. Recovery must use non-SMS mechanisms such as recovery codes, organization-owner recovery, or an audited break-glass process.

## Amendment (2026-06-11): Fresh-per-action challenge and corrected gate list

Two corrections to the Consequences, edited in place above.

First, the original text allowed "a fresh passkey/TOTP challenge" or a sufficiently strong existing session to satisfy a High-Assurance Challenge. The session alternative is deleted: a High-Assurance Challenge always requires a fresh factor verification (passkey or TOTP) at challenge time, completed on the Human Approval Surface. Login-time MFA, session age, and session attributes never satisfy it, and clearing a challenge grants no reusable authority for future actions (ADR-0032).

Second, the original gate list included "Secret Import into a Protected Environment." That operation does not exist: Secret Import is a non-protected development-only adoption helper, and Protected, preview, staging, production, and other non-development Environments reject import with `import.unsupported_environment` before values are parsed or written (ADR-0007 defines the error code and CLI contract; ADR-0016 mandates rejection before values are parsed). The item is removed from the list in place rather than footnoted so the Consequences read as the correct gate set.
