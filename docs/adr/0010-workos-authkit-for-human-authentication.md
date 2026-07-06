# ADR-0010: WorkOS AuthKit For Human Authentication

Date: 2026-05-23

Status: Accepted

WorkOS AuthKit will own the full human authentication path for insecur, including hosted login, MFA, and passkey/TOTP support. insecur will still own authorization through organization and project memberships, roles, tenant boundaries, and audit.

## Consequences

The current GitHub OAuth allowlist is disposable learning code and should be replaced before v1 production use. If GitHub identity remains useful, it should be routed through WorkOS rather than maintained as a separate app-owned OAuth stack. WorkOS API credentials become managed deployment secrets, while provider integrations remain modeled as app connections.

## Amendment (2026-07-04): Device-authorization login for remote shells

Human login gains an OAuth device-authorization flow, `insecur login --device`, for shells whose
host the human's browser cannot reach: cloud agent environments, devcontainers, Codespaces, and
SSH sessions. The CLI prints a short user code and verification URL; the human approves from any
browser through the same WorkOS AuthKit path (hosted login, MFA, passkeys); the resulting session
is the human's own, held per ADR-0007's session custody (2026-07-06 amendment: sealed
keychain-backed persistence, never plaintext on disk), with the same lifetime and step-up rules as
loopback PKCE login. `--agent` mints the session agent-marked per the ADR-0032 amendment of
2026-07-04. The loopback PKCE flow remains the default on machines the human's browser can reach.

Device-authorization flows carry a known cross-device consent phishing surface (an attacker
induces a victim to approve the attacker's pending code). Required treatment: the verification
page displays requester context (requesting host identifier and coarse geolocation/IP) beside the
code before approval; the user code is short-lived, single-use, and rate-limited per account and
per source; approval happens only on the authenticated verification page, never via a link that
embeds the code; and every device-flow approval and denial is audited. High-Assurance Challenges
remain unsatisfiable through a device-flow session's creation — enrolled-factor verification on
the Human Approval Surface is unchanged.
