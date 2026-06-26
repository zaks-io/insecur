# Runbook: Machine Identity Credential Compromise

Concrete Security Runbook following the interface in
[../security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).
Responds to suspected compromise of a Machine Identity auth method (GitHub Actions
OIDC trust, Environment Deploy Key, or bootstrap client credential). Distinct from
[custody-material-compromise.md](custody-material-compromise.md), which covers
instance root key and Cloudflare account scope.

This runbook is **HITL, human-only** for credential rotation. No agent executes
disable or rotation steps.

## purpose

Contain a compromised or over-exposed machine credential, stop new short-lived
access tokens from being minted under that trust, and preserve metadata evidence
for audit and tenant notification when delivery scope warrants it.

## when_to_use

- **Triggers:**
  - Deploy key or OIDC token appeared in CI logs, a public repo, or a transcript.
  - Unexpected `machine_auth.github_actions_oidc_exchanged` events for unknown
    repositories or workflows.
  - Spike in `machine_auth.github_actions_oidc_exchange_denied` with
    `auth.oidc_wrong_repository` or `auth.oidc_untrusted_source`.
  - Compromise-response rotation required: auth method marked untrusted per
    ADR-0004.
  - Pending Approval Request became requester-access-stale due to Machine Identity
    disablement.
- **Non-triggers:**
  - Single denied OIDC exchange (may be misconfiguration, not compromise).
  - Instance root key or Provider Credential exposure (escalate to
    [custody-material-compromise.md](custody-material-compromise.md)).
  - Human session compromise (User and session response catalog row).

## scope

One Machine Identity (`mach_*` placeholder), its auth methods, and the
Organization / Project / Environment bound to the credential. Deploy keys are
scoped to one Environment and explicit Runtime Injection Policy allowlists.

## required_authority

- Organization owner or admin with machine-identity and auth-method configuration
  scopes.
- High-Assurance Challenge for disablement, rotation, or trust-boundary changes.
- GitHub (or provider) admin to revoke app installations or rotate repository
  secrets when OIDC trust is implicated.

## preconditions

- Machine Identity ID and auth method type are known from audit metadata.
- Audit window export is available or can be produced per
  [audit-export-and-verification.md](audit-export-and-verification.md).
- Protected Environment delivery requires ADR-0038 machine credential; confirm no
  human session was used for protected grant issue.

## safe_inputs

New deploy keys and bootstrap secrets enter only through stdin or masked prompts
never `--token <value>`. OIDC does not use long-lived insecur tokens in GitHub.

## dry_run

Metadata-only scope preview:

```bash
insecur audit tail --json --org-id <org_id_placeholder> --event-code machine_auth.github_actions_oidc_exchanged
insecur audit tail --json --org-id <org_id_placeholder> --event-code machine_auth.github_actions_oidc_exchange_denied
```

Enumerate:

- `machine_identity_github_actions_oidc` rows: `github_repository`, `status`,
  `credential_scopes`, bound `environment_id`.
- Active Injection Grants and in-flight operations for the Environment.
- Pending Approval Requests created by the Machine Identity (metadata IDs only).

## execute

1. **Classify** auth method: GitHub Actions OIDC, Environment Deploy Key, or
   bootstrap client.
2. **Disable** the Machine Identity or mark the specific auth method `disabled`
   (compromise-response rotation) before issuing replacements.
3. **Revoke upstream trust:**
   - OIDC: remove or tighten repository/environment claims on the auth method;
     revoke suspicious GitHub workflow permissions.
   - Deploy key: disable key; create replacement only after High-Assurance Challenge.
4. **Invalidate delivery surface:** active Injection Grants for the Environment
   expire by policy; confirm `runtime_injection.grant_issue_denied` for blocked
   re-issue while disabled.
5. **Audit export** the incident window per
   [audit-export-and-verification.md](audit-export-and-verification.md).
6. **Re-enable path:** new auth method with fresh trust boundaries; never re-enable
   the compromised method without explicit risk acceptance ADR.

Token minting seam: `mintMachineAccessToken` / `verifyMachineAccessToken` in
`@insecur/machine-auth`; exchange path `exchangeGitHubActionsOidc` records
`machine_auth.github_actions_oidc_exchanged` or
`machine_auth.github_actions_oidc_exchange_denied`.

CLI entry for CI:

```bash
insecur login --method oidc --provider github-actions
```

## verify

- Disabled auth method rejects exchange with `machine_auth.github_actions_oidc_exchange_denied`
  or deploy-key equivalent denial.
- No new `machine_auth.github_actions_oidc_exchanged` events for the old trust
  boundary after disable timestamp.
- Replacement credential (if issued) succeeds only under the new boundary.
- Protected Runtime Injection still requires machine credential per ADR-0038;
  human session cannot issue protected grants.
- Related pending Machine Identity Approval Requests show requester-access-stale
  when durable authority was removed.

## expected_audit

- `machine_auth.github_actions_oidc_exchange_denied` with stable `result_code`
  (`auth.oidc_wrong_repository`, `auth.oidc_untrusted_source`, etc.) and metadata
  `oidcDenialKind` in `details`.
- Machine Identity disablement and auth-method lifecycle events (configuration
  audit when surfaced through product API).
- `runtime_injection.grant_issue_denied` if delivery attempted under disabled
  identity.
- `approval.action_denied` if a machine actor attempted Human Approval Surface
  actions.

## recovery

- **False positive:** re-enable only after confirming audit trail; document in
  evidence with drill ID.
- **Partial disable:** if one auth method remains active on the same identity,
  treat as still compromised until all methods are rotated.
- **Escalation:** correlated cross-tenant anomalies →
  [custody-material-compromise.md](custody-material-compromise.md).
- **Stop:** do not clear High-Assurance Challenge or approval requirements to
  speed re-enable.

## no_reveal_handling

- Never log OIDC bearer tokens, deploy key material, or minted access tokens.
- Audit tail and export use metadata-only fields; `details.oidcDenialKind` is
  categorical, not token content.
- CLI session tokens stay memory-only per cli-and-sync auth rules.
- Investigation tickets cite event IDs and machine identity IDs only.

## customer_communication

Notify Organization owners when the compromised credential could have delivered
secrets to an attacker-controlled workflow or environment. State what was
disabled and whether upstream GitHub (or provider) revocation is required.
Default silent fix only for isolated `-dev` misconfiguration with no production
scope.

## evidence

Attach to the Security Evidence Bundle (`auth.*` / `runtime_injection.*`), all
metadata-only:

- Machine Identity ID, auth method ID, disable timestamp.
- Audit event ID range for exchange success/denial during incident.
- Verified export hash for incident window.
- Upstream revocation ticket ID (GitHub/provider).
- Runbook drill ID (`runbook.*`).
