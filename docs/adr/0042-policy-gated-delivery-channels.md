# ADR-0042: Policy-Gated Delivery Channels

Date: 2026-05-25

Status: Accepted

Production Delivery will separate agent-reachable request paths from human approval authority. CLI and API callers may plan, request, stage, and poll high-risk operations, but Protected Environment approval, High-Assurance Challenge completion, protected delivery configuration approval, and Cloudflare Worker Secret Deploy approval evidence are reviewed in the authenticated web app Human Approval Surface. Delivery Risk Policy may allow configured non-protected development or preview delivery through agent-reachable channels, such as CLI or machine automation, but V1 will not allow production Protected Environment approval to become terminal-only or agent-clearable.

## Considered Options

- CLI-only approval for all environments. Rejected because local agents can drive terminal commands and API calls with the inherited session, making production approval too easy to automate accidentally or maliciously.
- Hard-code every environment to the same strict approval path. Rejected because non-protected preview and development workflows should be configurable enough for teams that intentionally allow agent-driven preview deploys.
- Policy-gated channels with secure defaults. Accepted: production stays human-gated, while organizations can consciously relax lower-risk non-protected workflows.

## Consequences

The default Delivery Risk Policy is secure-first. Protected Environments route approval and High-Assurance Challenges through the Human Approval Surface. Agent-reachable channels receive bounded operation IDs, metadata-only plans, status, and retry/poll behavior, but not authority to clear the protected gate.

Non-protected development and preview workflows may be configured for CLI or automation delivery when the Organization accepts that risk. Those policies must be explicit, auditable, and scoped to non-protected Environments. They do not apply to Protected Environment Promotion, protected Runtime Injection Policy changes, protected Secret Sync enable/run, protected App Connection or Connection Boundary changes, or production Cloudflare Worker Secret Deploy approval evidence.
