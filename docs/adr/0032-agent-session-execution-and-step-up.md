# ADR-0032: Agent Execution In The Human Session With First-Class Step-Up

Date: 2026-05-24

Status: Accepted

A local coding agent has no identity of its own. It runs inside a human-initiated CLI session started with `insecur shell <profile-id>` or `insecur run <profile-id> --login -- <command>`, inherits the short-lived `INSECUR_SESSION_TOKEN` from the process environment, and acts with the human's Effective Access. We deliberately do not give local agents their own Machine Identity: a High-Assurance Challenge re-verifies the human freshly per high-risk action, so an agent can do low-risk work autonomously but structurally cannot clear a high-risk gate on its own.

High-risk actions that the acting credential cannot satisfy fail closed with a dedicated exit code `10` and stable error code `auth.high_assurance_required`, distinct from `3` (authentication required or expired) and `4` (authorization denied). The error envelope carries a bounded operation ID describing the exact pending action the human must authorize. The human clears the High-Assurance Challenge out-of-band in the authenticated web app against that operation ID, which grants no reusable authority for future actions, and the agent resumes by polling `insecur operations wait <operation-id>` and continuing against the same bounded operation ID. This reuses the bounded-operation machinery already required for asynchronous High-Assurance Challenge execution.

## Considered Options

We considered issuing local agents their own Machine Identity or a scoped bootstrap credential. Rejected because it would give agents standing authority that accumulates outside a human session and that a High-Assurance Challenge could not gate. Tying the agent to the human's live session keeps the human verification boundary meaningful: the agent's authority is exactly the human's current session, no more, and high-risk gates always route back to a fresh human check.

## Consequences

`auth.mfa_required` is retired for the action boundary in favor of `auth.high_assurance_required`; `auth.mfa_enrollment_required` is reserved for the distinct case where the human has no eligible factor enrolled. Agents must treat exit code `10` as a handoff signal, not a failure, and must not attempt to satisfy a High-Assurance Challenge themselves. Machine Identities and Environment Deploy Keys receive the same `10` and `auth.high_assurance_required` result for high-risk gates, cannot self-clear, and must surface the step-up to a human.
