# ADR-0032: Agent Execution In The Human Session With First-Class Step-Up

Date: 2026-05-24

Status: Accepted

A local coding agent has no identity of its own. It runs inside a human-initiated CLI session started with `insecur shell <profile-id>` or `insecur run <profile-id> --login -- <command>`, inherits the short-lived `INSECUR_SESSION_TOKEN` from the process environment, and acts with the human's Effective Access. We deliberately do not give local agents their own Machine Identity: a High-Assurance Challenge re-verifies the human freshly per high-risk action, so an agent can do low-risk work autonomously but structurally cannot clear a high-risk gate on its own.

High-risk actions that the acting credential cannot satisfy fail closed with a dedicated exit code `10` and stable error code `auth.high_assurance_required`, distinct from `3` (authentication required or expired) and `4` (authorization denied). The error envelope carries a bounded operation ID describing the exact pending action the human must authorize. The human clears the High-Assurance Challenge out-of-band in the authenticated web app against that operation ID, which grants no reusable authority for future actions, and the agent resumes by polling `insecur operations wait <operation-id>` and continuing against the same bounded operation ID. This reuses the bounded-operation machinery already required for asynchronous High-Assurance Challenge execution.

## Considered Options

We considered issuing local agents their own Machine Identity or a scoped bootstrap credential. Rejected because it would give agents standing authority that accumulates outside a human session and that a High-Assurance Challenge could not gate. Tying the agent to the human's live session keeps the human verification boundary meaningful: the agent's authority is exactly the human's current session, no more, and high-risk gates always route back to a fresh human check.

## Consequences

`auth.mfa_required` is retired for the action boundary in favor of `auth.high_assurance_required`; `auth.mfa_enrollment_required` is reserved for the distinct case where the human has no eligible factor enrolled. Agents must treat exit code `10` as a handoff signal, not a failure, and must not attempt to satisfy a High-Assurance Challenge themselves. Machine Identities and Environment Deploy Keys receive the same `10` and `auth.high_assurance_required` result for high-risk gates, cannot self-clear, and must surface the step-up to a human.

## Amendment (2026-06-11): Who may clear a bounded operation

The record above says a High-Assurance Challenge "re-verifies the human freshly" but never names who is authorized to clear a bounded step-up operation. This amendment makes that explicit for High-Assurance Challenge bounded operations other than Approval Request approval and rejection, whose approval authority is owned by ADR-0017 and unchanged here.

1. A bounded operation created in a human session is cleared only by the same session User whose Effective Access the pending action was evaluated under, via fresh factor verification on the Human Approval Surface. This makes explicit what the fresh re-verification model already implies, and the exit-code semantics already encode it: a missing Authorization Scope is exit `4` (authorization denied), so exit `10` means the session User holds the scope and lacks only fresh assurance.
2. A bounded operation created by a Machine Identity or Environment Deploy Key is cleared only by a User whose own Effective Access includes the Authorization Scopes the pending action requires, so a low-privilege User cannot authorize a machine-executed protected change.
3. The cleared challenge authorizes only the exact bounded operation as captured at creation; bounded operation metadata cannot be broadened between challenge issuance and completion (docs/operation-store.md). Clearing imports none of the clearing User's wider access into the resumed execution and never extends the original credential past its hard bounds: the deploy-key prohibitions in docs/cli-and-sync.md remain unconditional, and an action outside a credential's hard bounds is an exit `4` authorization denial, never an exit `10` step-up.
4. The clearing User is recorded on the operation alongside the original credential, consistent with the High-Assurance Challenge evidence audit posture in product-spec.md.

ADR-0052's matching 2026-06-11 amendment applies this same per-action bounded-operation model to CLI-side Secret Reveal, dropping its time-boxed elevation window for V1 so no cleared challenge becomes reusable authority.

## Amendment (2026-06-12): How a cleared bounded operation resumes execution

The 2026-06-11 amendment pinned who may clear a bounded step-up operation; the resume half remained one sentence ("the agent resumes by polling `insecur operations wait <operation-id>` and continuing against the same bounded operation ID"). That sentence underspecifies the handshake: `operations wait` is metadata-only polling, and docs/operation-store.md allows the `waiting_for_human` to `running` transition while listing only `blocked` and `incomplete` as retryable, so no documented call performs the resume. This amendment pins the resume contract for the High-Assurance Challenge bounded operations covered by the 2026-06-11 amendment, so the Human Approval Surface and the CLI/API execution path implement two halves of one handshake.

1. Clearing records single-use High-Assurance Challenge evidence on the bounded operation and leaves it in `waiting_for_human`. Clearing itself causes no live effect: there is no queue or background executor that picks a cleared operation up, consistent with the inline execution model.
2. Resume is re-execution through the original command path carrying the bounded operation ID, under the same acting credential the operation was created for. This is the sole user-visible resume path for step-up; the `insecur operations retry <op-id>` command in docs/cli-and-sync.md stays scoped to sync `incomplete` resume. Executing under the original credential restates the no-import rule above: the clearing User's access never becomes the executing authority.
3. At the Operation Store interface, this resume extends the existing `retryOperation` contract to cover `waiting_for_human` with recorded evidence rather than minting a parallel verb. docs/operation-store.md's Interface entry, "Retryable" derived set, and resumability prose carry this and must change together with this amendment.
4. The resuming request atomically consumes the evidence in the same compare-and-set write as the `waiting_for_human` to `running` transition. Evidence consumption and the state transition are one write, so concurrent resume attempts lose deterministically: exactly one request consumes the evidence and runs, and evidence can never be consumed twice.
5. A resume attempt with consumed, expired, or absent evidence fails closed with the existing exit `10` / `auth.high_assurance_required` carrying a fresh bounded operation ID. No new error code, exit code, or operation state is introduced.
6. `insecur operations wait <operation-id>` exposes cleared-evidence presence as metadata-only progress while the operation remains `waiting_for_human`, giving the polling loop an observable signal to stop waiting and re-execute. Wait stays read-only and never performs the resume itself.
7. The Publish High-Assurance Challenge rule in docs/protected-change-orchestration.md (single-use, time-limited, bound to the exact Staged Change Set review fingerprint) is an instance of this general evidence-consumption rule, not a parallel mechanism.
8. Evidence expiry behavior is defined here: expired evidence takes the same exit `10` fresh-bounded-operation path as consumed or absent evidence. The validity-window value itself remains the tracked open question in docs/open-questions.md; nothing in this amendment decides that number.
