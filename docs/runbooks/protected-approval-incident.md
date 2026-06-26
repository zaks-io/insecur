# Runbook: Protected Approval Incident

Concrete Security Runbook following the interface in
[../security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).
Handles suspicious, stuck, or wrongly cleared Protected Environment Approval
Requests without creating a Secret Reveal path or clearing approvals through
agent-reachable channels.

## purpose

Investigate and remediate approval workflow incidents: stale impact reviews,
unauthorized approval attempts, policy-stale closures, and requester-access-stale
states while preserving metadata-only investigation output.

## when_to_use

- **Triggers:**
  - Suspected approval cleared without intended human review.
  - Approval Request stuck pending with changing delivery impact.
  - `approval.action_denied` or `auth.high_assurance_required` spikes on
    promotion or protected configuration paths.
  - `approval.review_stale` (exit `6`) reported by CLI during promote polling.
  - Policy or membership change made pending requests policy-stale or
    requester-access-stale.
- **Non-triggers:**
  - Non-protected development promotion (no Approval Request).
  - Machine credential compromise (use
    [machine-identity-credential-compromise.md](machine-identity-credential-compromise.md)).
  - Storage gate blocks before approval is reached.

## scope

One Organization, Project, Protected Environment, and Approval Request
(`appr_*` placeholder) or Promotion Change Set. Partial Approvals are per-User
metadata records, not reusable authority.

## required_authority

- Organization owner/admin for cleanup cancellation and investigation.
- Approving Users with approval scopes and High-Assurance Challenge for legitimate
  approve/reject (Human Approval Surface only).
- Security reviewer with audit export scope; Sensitive Detail Gate for decrypted
  Sensitive Metadata in impact review.

## preconditions

- Approval Request ID and environment ID are known.
- Protected Approval Policy version for the environment is readable (metadata).
- Web BFF Human Approval Surface is the only channel that can terminal-approve;
  CLI may create requests and poll only.

## safe_inputs

Approval Context Notes are Sensitive Metadata; investigators use low-privilege
export (note IDs, hashes, lengths) unless Sensitive Detail Gate authorizes
full-fidelity review in the web app.

## dry_run

Metadata-only impact preview:

```bash
insecur approvals list --env-id <env_id_placeholder> --json
insecur operations get <op_id_placeholder> --json
```

API seams (Human Approval Surface only for terminal approve/reject):

```text
GET  /v1/orgs/:org/projects/:project/environments/:env/approvals
POST /v1/orgs/:org/projects/:project/environments/:env/approvals/:approval/approve
POST /v1/orgs/:org/projects/:project/environments/:env/approvals/:approval/reject
```

CLI promotion request path:

```bash
insecur secrets promote --draft-version-id <sv_id_placeholder> --comment "Investigation hold"
```

Review Approval Impact Review fingerprint, Partial Approval count, and stale flags
without Sensitive Values.

## execute

1. **Freeze delivery:** do not re-run promote/publish until state is understood.
   Cancel attacker-driven requests only with owner/admin cleanup authority or
   requester self-cancel rules.
2. **Export audit** for the request lifecycle per
   [audit-export-and-verification.md](audit-export-and-verification.md). Filter
   codes: `approval.request_created`, `approval.request_approved`,
   `approval.request_rejected`, `approval.action_denied`.
3. **Check staleness:**
   - **Policy-stale:** Protected Approval Policy changed → pending requests close
     without promotion; require fresh request under new policy.
   - **Requester-access-stale:** requester lost durable authority (membership,
     Machine Identity disable, Tenant Suspension).
   - **Review-stale:** `approval.review_stale` — impact changed; approver must
     re-review with new High-Assurance Challenge.
4. **Reject or cancel** illegitimate requests via Human Approval Surface; Machine
   Identities cannot approve (`approval.action_denied`).
5. **If promotion already occurred:** use protected rollback workflow (new version
   from retained encrypted prior Published Version); never reveal plaintext.
6. **Document** findings in metadata-only incident record.

## verify

- Pending requests show correct terminal state (`rejected`, `canceled`,
  `policy_stale`, `requester_access_stale`) in `approvals list`.
- No Published Version change from illegitimate approve path; audit shows only
  denied machine approve attempts if agents tried CLI/API approve routes.
- Fresh legitimate request recomputes Approval Impact Review fingerprint.
- `sync.execution_completed` only after valid promotion and enabled syncs.

## expected_audit

- `approval.request_created` with metadata-only impact snapshot references.
- `approval.request_approved` / `approval.request_rejected` only from User actors
  on Human Approval Surface.
- `approval.action_denied` for machine/session attempts on approve/reject routes
  or missing approval scopes.
- `auth.high_assurance_required` with bounded `operationId` for step-up paths.
- Promotion-related `sync.execution_*` only after valid approval chain.

## recovery

- **Stale review:** requester re-runs `insecur secrets promote`; approvers fresh
  challenge on web app.
- **Wrong promotion shipped:** emergency rollback per Secret lifecycle catalog
  (encrypted prior version); opens new Approval Request.
- **Policy change mid-flight:** close stale requests; do not reuse Partial
  Approvals.
- **Stop:** never disable Protected Approval Policy or High-Assurance Challenge to
  unblock agents; fix authority and impact review instead.

## no_reveal_handling

- Approval lists and operation status show IDs, fingerprints, hashes, not Sensitive
  Values or decrypted provider target names.
- Approval Context Notes never appear in CLI JSON by default.
- Investigation uses verified audit export; do not paste note plaintext into
  Linear.
- Agents and deploy keys must receive `auth.high_assurance_required` (exit `10`)
  for protected approval completion, not workarounds.

## customer_communication

Notify Organization owners when an unauthorized promotion may have changed Protected
Environment delivery. Metadata-only summary: affected environment, request IDs,
whether rollback is required. No secret values or provider plaintext.

## evidence

Attach to the Security Evidence Bundle (`protected_change.*`), all metadata-only:

- Approval Request IDs, fingerprints, terminal states.
- Audit export verify hash for incident window.
- Published Version IDs before/after (opaque IDs only).
- Rollback operation ID if executed.
- Runbook drill ID (`runbook.*`).
