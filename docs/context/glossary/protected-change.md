# Protected Change Orchestration

Glossary slice for agents. Term definitions are authoritative here and single-sourced;
do not copy them into package context files. Index and routing: [`../../../CONTEXT.md`](../../../CONTEXT.md).
Term relationships: [`../relationships.md`](../relationships.md). Usage examples: [`../dialogue.md`](../dialogue.md).

## Protected Change Orchestration

**Promotion**:
A secret lifecycle event that makes a secret version eligible for protected delivery.
_Avoid_: save, set when protected delivery is meant, approve and enable sync; split into Promotion and a separate Protected Delivery Configuration Change, go live as Promotion for a Protected Environment (vs Current Version selection for a non-protected Environment)

**Promotion Change Set**:
An exact immutable set of Draft Versions requested for Promotion together.
_Avoid_: all staged changes, promote all / all staged changes as a promotion selector; use explicit Promotion Change Set with exact Draft Versions (assembled batch is a Staged Change Set made live by Publish)

**Staged Change Set**:
A batch of not-yet-live protected changes (Draft Versions, disabled Secret Syncs and Bindings, pending Shared Secret Source attachments, and pending policy changes) assembled together and made live through a single Publish.
_Avoid_: Promotion Change Set when configuration changes are included, deploy

**Publish**:
The single reviewed action that makes a Staged Change Set live by promoting its Draft Versions and activating its configuration changes, clearing every gate the acting User is individually authorized to clear and fanning out to a Distinct Approver only where the Protected Approval Policy requires one.
_Avoid_: Promotion when the whole batch is meant, deploy, Published Version when the secret-version noun is meant, publish the changes / go live with everything / ship the batch as Publish of a Staged Change Set when a grouped set of protected and configuration changes is made live together, single approval for everything as Publish clearing every gate the acting User is individually authorized to clear; does not collapse distinct approval purposes or bypass a multi-approval Protected Approval Policy

**Protected Change Orchestrator**:
The Module that coordinates **Staged Change Sets**, **Promotion Change Sets**, **Approval Requests**, **Publish**, stale closures, and final apply for one **Protected Environment** while returning metadata-only state and impact. Its canonical Interface lives in `docs/protected-change-orchestration.md`.
_Avoid_: approval service, deployer, promotion handler when the whole protected-change state machine is meant

**Approval Request**:
A pending protected promotion or configuration change waiting for required human approval before it can affect delivery.
_Avoid_: notification when the approval object is meant, restore approval after archive; target lifecycle changes that stop protected Promotion close pending Approval Requests terminally

**Approval Request Supersession**:
Replacing a pending Approval Request with a newer Approval Request by marking the older request superseded.
_Avoid_: overwrite when implying in-place mutation

**Approval Request Rejection**:
An approval review decision that closes an **Approval Request** without **Promotion** or protected delivery changes.
_Avoid_: deny when authorization failure is meant, cancel when requester cancellation is meant, deny approval for a human review outcome (vs authorization denial for access failure), approver cancellation, unless the actor is also the requester or a scoped owner/admin cleanup actor

**Approval Request Cancellation**:
A requesting **User**, requesting **Machine Identity**, or administrative cleanup action that closes a pending **Approval Request** without **Promotion** or protected delivery changes.
_Avoid_: rejection when an approver review outcome is meant, cancel approval when requester, requesting Machine Identity, or scoped admin closes a pending request without review, agent undo when the same requesting Machine Identity withdraws its own pending request

**Approval Rejection Note**:
An optional untrusted, length-limited approver note recorded with an **Approval Request Rejection** to explain the rejection without becoming approval source of truth.
_Avoid_: required rejection reason, denial reason when authorization failure is meant, rejection reason for optional user-authored rejection text (vs denial reason for authorization failure metadata)

**Approval Impact Review**:
A metadata-only view of the current Secret Delivery and Secret Sync impact of an Approval Request, including enabled syncs that Promotion will enqueue.
_Avoid_: diff when implying Sensitive Values are compared, approval diff for metadata-only delivery and sync impact

**Approval Impact Review Fingerprint**:
A stable metadata-only digest or version identifier for the server-generated facts in one **Approval Impact Review**.
_Avoid_: secret hash, value hash, impact hash for the metadata-only binding between a review and approval

**Approval Impact Snapshot**:
A persisted metadata-only record of the **Approval Impact Review** used for the final approval decision that caused **Promotion**.
_Avoid_: current impact, historical diff when the approval-time evidence is meant, approved impact for persisted delivery and sync impact evidence used for the final approval decision, approval source of truth refers to server-generated Promotion Change Set and Approval Impact Review for pending, and Approval Impact Snapshot for historical final evidence, not an Approval Context Note

**Current Impact Preview**:
An optional recomputed metadata-only view of current delivery and sync impact shown for investigation, without becoming historical approval evidence.
_Avoid_: approval impact snapshot, source of truth

**Approval Context Note**:
An optional untrusted, length-limited requester note shown with an Approval Request to explain intent without becoming approval source of truth. Approval Context Notes are Sensitive Metadata.
_Avoid_: approval summary when implying authoritative facts, agent summary when it is requester-supplied explanatory text on an Approval Request

**Approval Notification**:
An out-of-band alert that an Approval Request needs review, without being the approval review surface.
_Avoid_: approval email when the channel is not the concept, approval email / approval ping for out-of-band alerts, push approval details; push Approval Notifications carry generic preview-safe alerts, not approval details, approval link is an Approval Notification deep link when it opens the authenticated approval view; must not imply a bearer approval action, stale approval link is an Approval Notification deep link resolving to closed or stale approval view state

**Primary Approval Notification Channel**:
The preferred out-of-band channel for alerting approvers about Approval Requests, without granting approval authority.
_Avoid_: primary approval path when approval still happens in the authenticated approval view, primary approval path only for notification preference, not approval authority

**Push Device Registration**:
A user-owned browser or mobile app push registration used to deliver Approval Notifications to one device, browser, or app installation.
_Avoid_: push token when device ownership and revocation are the concern

**Startup Configuration**:
A value expected to be read when an application process, job, deploy, or provider runtime starts rather than changing continuously while it runs.
_Avoid_: dynamic config when runtime update behavior is required, rapidly changing env var is usually not Startup Configuration; use a future dynamic secret or configuration mechanism instead of repeated Promotion requests

**Protected Delivery Configuration Change**:
A change to where or how Protected Environment secrets may be delivered.
_Avoid_: config tweak when delivery authority changes

**Protected Approval Policy**:
The rule that decides how many human approvals are required before a protected change can affect delivery.
_Avoid_: two-person approval when the configured policy may require one or more approvers

**Protected Approval Policy Change**:
A high-assurance configuration mutation that changes the **Protected Approval Policy** for one **Protected Environment**.
_Avoid_: approval request when the V1 configuration mutation is meant, approval policy approval; use Protected Approval Policy Change in V1 unless a future separate approval purpose exists

**Approval Policy Staleness**:
Closing a pending **Approval Request** without **Promotion** because the affected **Protected Approval Policy** changed before approval completed.
_Avoid_: auto-reapproval, policy migration when pending approval requirements changed, policy changed approval when a pending request is closed because its Protected Approval Policy changed

**Requester Access Staleness**:
Closing a pending **Approval Request** without **Promotion** because the requesting **User** or **Machine Identity** no longer has current authority for the affected **Project** and **Protected Environment** before approval completed.
_Avoid_: cancellation when no requester or admin explicitly closed it, rejection when no approver reviewed it, requester lost access when a pending Approval Request is closed because its requesting User or Machine Identity no longer has authority, expired agent token is not Requester Access Staleness unless the Machine Identity or the request's Auth Method also lost durable authority, rotated deploy key is not Requester Access Staleness unless rotation revoked, disabled, or marked untrusted the Auth Method used for the pending request, restored request; a requester-access-stale Approval Request stays audit-only even if the requester regains access, paused approval during suspension; Tenant Suspension performs Requester Access Staleness for pending Approval Requests

**Requester Self-Approval**:
An **Approval Request** approval by the same **User** who requested the protected change.
_Avoid_: auto-approval when the **High-Assurance Challenge** is still required

**Distinct Approver**:
A unique **User** whose approval can count at most once toward one **Protected Approval Policy** for one **Approval Request**.
_Avoid_: team approval, membership approval when the counted approver is meant

**Partial Approval**:
An approval recorded on an **Approval Request** before its **Protected Approval Policy** is satisfied.
_Avoid_: pre-approval, reusable approval, pre-approval only when referring to an approval recorded on a still-pending Approval Request, carry over approval; Partial Approvals are request-bound and cannot be reused, revoked approval; audit-only Partial Approval after failed Approver Access Revalidation when the approval record remains in history, restored approval; if failed Approver Access Revalidation made it audit-only, the User must approve again after regaining access

**Approver Access Revalidation**:
Checking that a **User** whose **Partial Approval** might count still has current approval authority for the affected **Project** and **Protected Environment** when the **Protected Approval Policy** threshold is evaluated.
_Avoid_: reapproval when checking whether a prior approval can still count

**Rollback**:
A secret lifecycle event that creates a new version from a retained older encrypted value and promotes it.
_Avoid_: revert, restore when referring to secret version promotion

**Rollback Retention Window**:
The configured period that keeps encrypted prior published versions eligible for emergency rollback.
_Avoid_: backup when no separate plaintext copy is meant, backup copy for encrypted prior version retention for rollback
