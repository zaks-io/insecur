# Protected Change Orchestration

Protected Change Orchestration is the Module that coordinates not-yet-live changes for a Protected Environment until they either become live or close as audit-only history. Its Interface is intentionally metadata-only: callers submit exact Opaque Resource IDs, request review or action, and receive state, impact, audit, and operation metadata. The Implementation owns the state machine behind that small Interface.

The Module exists because protected changes have many separate gates: Effective Access, Protected Approval Policy, High-Assurance Challenge, Approval Impact Review, Sensitive Detail Gate, Storage Security Gate, and delivery-specific revalidation. If every caller hand-rolls those gates, approval bugs become distributed. The orchestrator gives the product one place with locality for protected-change ordering, stale-state handling, and final apply.

## Scope

The orchestrator owns:

- Promotion Change Set creation for exact Draft Versions in one Protected Environment.
- Staged Change Set review and Publish for one Protected Environment.
- Approval Request lifecycle for protected Promotion.
- Approval Impact Review, Approval Impact Review Fingerprint, and Approval Impact Snapshot orchestration.
- Partial Approval counting, requester self-approval rules, and Approver Access Revalidation.
- Terminal closing conditions: rejection, cancellation, supersession, Approval Policy Staleness, Requester Access Staleness, target lifecycle closure, and draft-discard closure.
- Final apply ordering for Promotion, protected delivery configuration activation, audit records, and Immediate Sync After Promotion run intents.

The orchestrator does not own:

- Effective Access resolution; it consumes a resolved actor scope.
- High-Assurance Challenge issuance; it binds actions to completed challenge evidence.
- Sensitive Detail Gate; it requests only metadata-safe impact by default and lets detail surfaces gate decrypted Sensitive Metadata.
- Secret encryption, Keyring, Tenant-Scoped Store, or Storage Security Gate readiness.
- Provider writes or Runtime Injection; delivery adapters still revalidate and fail closed before decrypt or provider write.
- Approval Notification delivery; notification adapters receive metadata-only events.
- App Connection setup, which is a live human/provider authorization flow and not a Staged Change Set item.

## V1 Cut And Add-Back Shape

This document describes the deepened Module shape, including the accepted Staged Change Set and
Publish model. V1 does not expose full Staged Change Set or batch Publish behavior unless the scope
decision is reopened. V1 live behavior is the narrower protected Promotion path: exact Draft Version
IDs in one Protected Environment create a Promotion Change Set and Approval Request, then the
orchestrator applies Promotion only after the current review, approval, staleness, and delivery
preflight gates pass.

Implementation must still keep the data model and Interface add-back-ready: approval counts are
threshold-generalizable even when the threshold is one, Approval Request purpose stays explicit, and
protected delivery configuration changes remain distinct from Promotion. Do not implement a
temporary promotion-only module that would require a later migration to add Staged Change Sets,
Distinct Approvers, or protected configuration items.

## Interface

The Interface should be narrow and exact:

- Assemble or inspect a Staged Change Set by Opaque Resource ID.
- Add exact Draft Versions and protected delivery configuration items to the Staged Change Set.
- Produce a metadata-only dry-run review for a Staged Change Set.
- Request Promotion for exact Draft Versions when no broader Staged Change Set is used.
- Publish a Staged Change Set under a High-Assurance Challenge bound to the review fingerprint.
- Record Partial Approval, rejection, cancellation, and stale closures for an Approval Request.
- Apply a fully authorized Promotion or Publish and return operation/audit metadata.

All mutating calls use resolved actor scope from the Effective Access Resolver, exact Opaque Resource IDs, and current server-side state. Display Names may appear only as authorized presentation metadata; they are never durable selectors. Wildcards, tag selection, pattern selection, "all drafts," and "all staged changes" are not Interface shapes.

## State Model

| Object | State | Meaning |
| --- | --- | --- |
| Draft Version | `draft` | Stored in the Draft Area and not eligible for protected delivery. |
| Draft Version | `published` | Made live by Promotion and eligible for protected delivery as a Published Version. |
| Draft Version | `discarded` | Terminally removed from the Draft Area; encrypted value material is crypto-erased in V1. |
| Approval Request | `pending` | Waiting for approval, rejection, cancellation, or a stale/close condition. |
| Approval Request | `approved_applied` | Protected Approval Policy was satisfied and Promotion was applied. |
| Approval Request | `rejected` | Closed by approver review without Promotion or delivery changes. |
| Approval Request | `canceled` | Closed by requester, requester Machine Identity, or scoped cleanup authority without Promotion or delivery changes. |
| Approval Request | `superseded` | Replaced by a newer Approval Request for the same Protected Environment. |
| Approval Request | `policy_stale` | Closed because the Protected Approval Policy changed before approval completed. |
| Approval Request | `requester_access_stale` | Closed because the requester lost durable authority before approval completed. |
| Approval Request | `target_closed` | Closed because the Project or Protected Environment no longer accepts protected Promotion. |
| Approval Request | `draft_discard_closed` | Closed because Draft Version Discard removed a Draft Version in the Promotion Change Set. |
| Staged Change Set | `assembling` | Holds not-yet-live Draft Versions and protected delivery configuration items. |
| Staged Change Set | `reviewed` | Has a current metadata-only review fingerprint. |
| Staged Change Set | `waiting_for_distinct_approver` | The acting User cleared the gates they can clear, but a Distinct Approver is still required. |
| Staged Change Set | `applied` | The reviewed batch became live under the same fingerprint. |
| Staged Change Set | `stale` | The batch, target, policy, requester authority, or impact changed and needs a fresh review. |

State names are documentation vocabulary, not a required database enum. The required behavior is that terminal states never become pending or approvable again, and live effects only happen from a current reviewed state.

## Invariants

- A Protected Environment uses Published Versions for delivery; Draft Versions are never delivered.
- A Promotion Change Set contains exact Draft Version IDs in one Protected Environment and is immutable after its Approval Request is created.
- Draft Versions created after an Approval Request are outside that request's Promotion Change Set.
- A Staged Change Set is scoped to one Protected Environment in V1 and carries exactly one Promotion Change Set for that environment's Draft Versions.
- Publish may coordinate Promotion and protected delivery configuration changes in one reviewed action, but the underlying promotion Approval Request still has exactly one purpose.
- Protected delivery configuration changes remain distinct from Promotion in authority and audit, even when one Publish clears several gates in one interruption.
- A High-Assurance Challenge for Publish is single-use, time-limited, and bound to the exact Staged Change Set review fingerprint.
- A batch whose contents, target state, approval policy, requester authority, or delivery impact changes after review must be reviewed again.
- Approval Impact Review is recomputed immediately before approval or final apply and includes enabled Secret Syncs that Promotion will run.
- Approval Impact Review validates Provider Value Size Limits for enabled Secret Syncs affected by protected Promotion; `sync.provider_value_too_large` blocks Promotion before Published Version changes or any Immediate Sync After Promotion run.
- Cloudflare Worker Secret Deploy impact from already-enabled Cloudflare Secret Syncs is approval evidence inside the accepted Approval Impact Review, not a second deploy approval.
- Partial Approvals count only while their Approval Impact Review Fingerprint still matches and the approving User still has current approval authority.
- Requester self-approval is allowed only for a one-approval Protected Approval Policy when the requester has approval scopes and completes the High-Assurance Challenge.
- Multi-approval policy always requires a Distinct Approver; batching never collapses it into requester self-approval.
- Rejected, canceled, superseded, policy-stale, requester-access-stale, target-closed, and draft-discard-closed Approval Requests are audit-only and cannot authorize future Promotion.
- Draft Version Reuse creates a fresh Promotion Change Set, fresh Approval Request, fresh Approval Impact Review, and fresh approvals.
- Draft Version Discard closes any pending Approval Request whose Promotion Change Set includes the discarded Draft Version.
- App Connections are prerequisites, not staged items. Missing App Connections create a human handoff before a Staged Change Set can reference that provider reach.
- Final apply persists the accepted Approval Impact Snapshot before or with the live state change, so the approval-time evidence remains reconstructable.
- Immediate Sync After Promotion runs enabled affected Secret Syncs after Promotion only when that impact was included in the accepted Approval Impact Review; disabled syncs stay disabled.
- Human, agent, JSON, audit, notification, dry-run, and operation outputs remain metadata-only and never include Sensitive Values.

## Implementation Shape

The orchestrator is deep when callers do not need to know the protected-change state machine. They should know the exact object they want to review or act on, and the orchestrator should own the rest:

- Ask the Effective Access Resolver for current capability in one Organization, Project, and Protected Environment.
- Ask the Protected Approval Policy evaluator which approval gates are required.
- Produce Approval Impact Review facts from current delivery configuration, exact Draft Versions, enabled sync run impact, Provider Value Size Limit eligibility, and Cloudflare Worker Secret Deploy impact where applicable.
- Bind High-Assurance Challenge evidence to the current review fingerprint.
- Store Approval Requests, Partial Approvals, snapshots, closures, and audit records through the Tenant-Scoped Store.
- Call Secret Version Store Promotion only after gates and Protected Promotion Sync Preflight are satisfied.
- Activate protected delivery configuration changes only from the reviewed Staged Change Set.
- Emit metadata-only events to Approval Notification adapters.
- Enqueue Immediate Sync After Promotion as operation IDs and target metadata, never Sensitive Values.

Storage Security Gate stays below delivery. The orchestrator may include gate status in an impact review, but delivery adapters still check the Storage Security Gate immediately before decrypt, provider write, or runtime injection.

## Test And Release Evidence

The Interface is the test surface:

- Promotion Change Set tests prove exact Draft Version IDs, one Protected Environment, immutable payload, no wildcard/all-staged selection, and all-or-nothing Promotion.
- Staged Change Set tests prove one Protected Environment scope, exact batch fingerprinting, no App Connection setup item, and stale review after any batch or target change.
- Publish tests prove one High-Assurance Challenge can clear only the gates the acting User is authorized to clear, and Distinct Approver requirements still fan out.
- Approval purpose separation tests prove Promotion approval cannot create or change protected delivery configuration, and protected delivery configuration approval cannot promote Draft Versions by itself.
- Approval Impact Review tests prove delivery and sync impact are recomputed before approval/final apply, Provider Value Size Limit failures block Promotion before publish, Sensitive Values are excluded, and stale review returns a stable denial without live effects.
- Partial Approval tests prove fingerprint binding, Approver Access Revalidation, distinct User counting, requester self-approval rules, and audit-only behavior after invalidation.
- Closure tests prove rejection, cancellation, supersession, Approval Policy Staleness, Requester Access Staleness, target lifecycle closure, and draft-discard closure are terminal.
- Draft Version Reuse tests prove closed Approval Requests cannot contribute approvals, impact reviews, snapshots, or screen state to a fresh request.
- Draft Version Discard tests prove affected pending Approval Requests close without Promotion and existing Partial Approvals become audit-only.
- Immediate Sync After Promotion tests prove enabled affected Secret Syncs run after Promotion only when included in the accepted Approval Impact Review, disabled syncs do not, and Cloudflare Worker Secret Deploy impact does not require a second approval for already-enabled syncs.
- Metadata safety tests prove no Sensitive Values, decrypted Sensitive Metadata, raw provider bodies, or child-process environments appear in review, approval, publish, notification, audit, operation, or JSON output.
