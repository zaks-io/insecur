# ADR-0033: Staged Change Set And Single Publish Gate

Date: 2026-05-24

Status: Accepted

An agent or developer assembles a batch of not-yet-live protected changes into a Staged Change Set in a non-protected development context, then makes the whole batch live through one reviewed Publish. A Staged Change Set holds Draft Versions and pending configuration changes such as disabled Secret Syncs and Secret Sync Bindings, pending Shared Secret Source attachments, and pending Protected Approval Policy changes. This is a plan-then-apply shape chosen to avoid approval fatigue: rather than interrupting the human once per change while an agent stands up an environment, the agent stages everything, confirms the batch, and the human takes a single interruption at Publish.

Publish performs Promotion of the batch's Promotion Change Set and activates its configuration changes in one action. A single Publish clears every gate the acting User is individually authorized to clear under one High-Assurance Challenge bound to a fingerprint of the exact batch contents, single-use and time-limited; if the batch changes or the challenge expires, a fresh Publish review and challenge are required. This refines ADR-0017's rule that protected delivery configuration changes need "separate approval or a separate High-Assurance Challenge" from Promotion: the separation is one of purpose, authority, and audit, not necessarily a separate human interruption. The underlying promotion Approval Request still carries exactly one approval purpose and is never merged with configuration changes; Publish orchestrates the gates above it.

Where a multi-approval Protected Approval Policy applies, Publish still fans the promotion out to a Distinct Approver. Batching never collapses a multi-approval policy into requester self-approval, and never bypasses any gate the acting User cannot satisfy.

App Connections are an organization-owned prerequisite, not a Staged Change Set item. Setting up an App Connection is a one-time, live, human-performed action per Organization and provider, the provider OAuth or app-install flow plus a High-Assurance Challenge. It records the performing User as `created_by` for audit but is owned by the Organization and survives that User's offboarding or loss of Organization Access. A Machine Identity cannot create one, so an agent that finds no App Connection covering the needed Connection Boundary must hand off to a human, surfaced as the ADR-0032 exit code `10`, before the batch can reference it.

## Considered Options

We considered a per-change High-Assurance Challenge, rejected because it produces approval fatigue during environment setup, which is the main agent workflow. We considered staging App Connection setup inside the batch, rejected because connection setup needs a live provider authorization round-trip and explicit human consent and is organization-scoped rather than environment-scoped, so it cannot be a deferred batch item.

## Consequences

The Approval Impact Review is extended to cover configuration items so `publish --dry-run` can present metadata-only impact over the whole batch, including which gates the acting User can clear versus which require a Distinct Approver. Publish is metadata-only in human, agent, and JSON output and never reveals Sensitive Values. Promotion Change Set remains a component of a Staged Change Set, and ADR-0017's invariant of one pending promotion Approval Request per Protected Environment is unchanged.

The canonical implementation-facing state machine for Publish lives in [protected-change-orchestration.md](../protected-change-orchestration.md).
