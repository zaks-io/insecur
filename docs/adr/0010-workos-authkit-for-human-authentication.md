# ADR-0010: WorkOS AuthKit For Human Authentication

Date: 2026-05-23

Status: Accepted

WorkOS AuthKit will own the full human authentication path for insecur, including hosted login, MFA, and passkey/TOTP support. insecur will still own authorization through organization and project memberships, roles, tenant boundaries, and audit.

## Consequences

The current GitHub OAuth allowlist is scaffold-only and should be replaced before v1 production use. If GitHub identity remains useful, it should be routed through WorkOS rather than maintained as a separate app-owned OAuth stack. WorkOS API credentials become managed deployment secrets, while provider integrations remain modeled as app connections.
