# Runtime Injection And Delivery

Glossary slice for agents. Term definitions are authoritative here and single-sourced;
do not copy them into package context files. Index and routing: [`../../../CONTEXT.md`](../../../CONTEXT.md).
Term relationships: [`../relationships.md`](../relationships.md). Usage examples: [`../dialogue.md`](../dialogue.md).

## Runtime Injection And Delivery

**Runtime Injection**:
Secret delivery that supplies plaintext secret values to a child process at execution time through the process environment, never by writing a dotenv or other plaintext file, even on a developer's own machine.
_Avoid_: pull, export when the value is meant to be consumed only by the process, wrapper is ambiguous; use Runtime Injection for the delivery behavior, say separate helper process only when a distinct local process is meant

**Diskless Development Secret Use**:
A non-protected development workflow where local commands receive Sensitive Values through **Runtime Injection** instead of local plaintext secret files.
_Avoid_: memory-only security when implying compromise-proof, agent-proof secret

**Local Secret File**:
A developer-workstation file, such as `.env`, that stores plaintext Sensitive Values for local application commands.
_Avoid_: config when the file contains Sensitive Values

**Local Secret File Migration**:
A one-way non-protected development adoption helper that reads a Local Secret File through a **Safe Sensitive Input Path** and creates **Blind Secret Writes** without writing Sensitive Values back to local files.
_Avoid_: export, pull, file delivery, import from .env / load my env file; use client-side Secret Import through a Safe Sensitive Input Path, not Secret Sync or Provider Readback, protected import / production .env import; local file import is only for non-protected development Environments, pull/export/generate .env for local plaintext output; use Local Secret File Migration for .env to insecur and Runtime Injection for command execution, auto-delete after import / rewrite .env after import; migration leaves the source file unchanged

**Import Preflight**:
A metadata-only validation pass over a Local Secret File or other import source that must succeed before any Blind Secret Writes are created.
_Avoid_: partial import, best effort import, best effort import / partial import; use Import Preflight and all-or-nothing import, last key wins / first key wins; duplicate final Variable Keys fail Import Preflight

**Secret Import Plan**:
A metadata-only description of what a Secret Import would create, match, or reject, produced without creating Secrets or Secret Versions and without showing Sensitive Values.
_Avoid_: value preview, env preview, preview .env values / show imported values; use Secret Import Plan for metadata-only import impact

**Secret Import Delivery Separation**:
The rule that Secret Import migrates Sensitive Values into non-protected development Secrets without creating, changing, or binding Runtime Injection Policies, Secret Syncs, CLI Profiles, or other delivery configuration.
_Avoid_: auto policy, import-created delivery, auto-create policy from import / import-created policy; Secret Import cannot create, change, or bind Runtime Injection Policies

**Import Existing Secret Conflict**:
An Import Preflight failure where a final Variable Key already maps to a Secret in the target Environment.
_Avoid_: overwrite by default, silent update, overwrite/update/reload from .env; import is create-only, existing final Variable Keys produce Import Existing Secret Conflicts

**Local Secret File Removal**:
An explicit user-commanded local filesystem deletion of a Local Secret File after migration, without rewriting the file or claiming secure erasure.
_Avoid_: shred, secure delete, automatic cleanup, shred .env / securely delete .env unless secure erasure is actually guaranteed; ordinary local deletion is Local Secret File Removal

**Runtime Injection Policy**:
A server-owned, workflow-scoped rule that authorizes runtime injection for a constrained command shape and exact secret bindings.
_Avoid_: local config when the authorization rule is meant, secret group when detached from a command or workflow, secret filter; use exact secret bindings, not patterns/filters, wildcard and pattern are invalid for secret selection, run policy when it authorizes secret delivery

**Runtime Injection Policy Version**:
An immutable snapshot of a runtime injection policy's bindings, command constraints, TTL, fingerprint requirements, and delivery behavior.
_Avoid_: current policy when reconstructing historical authorization, edit policy means create a new version and update the active version pointer

**Runtime Policy Version Retention**:
The rule that runtime injection policy versions are retained indefinitely as non-plaintext audit metadata.
_Avoid_: rollback retention when policy metadata retention is meant

**Runtime Policy Key**:
A stable opaque key that resolves to exactly one runtime injection policy.
_Avoid_: profile when the policy selector is meant, deploy key access is allowlisted Runtime Policy Key attachment, not direct secret access, policy key when it selects one runtime injection policy

**Injection Grant**:
A short-lived authorization to perform one runtime injection under an exact **Runtime Injection Policy Version** or an allowed non-protected one-command selection. It has the lifecycle `issued -> consumed | expired | revoked` (the three non-issued states terminal), and its secret bindings and delivered secret version ID pin at issue, per [ADR-0074](../../adr/0074-injection-grant-lifecycle-and-revocation.md).
_Avoid_: token, reusable approval

**Runtime Injection Grant Service**:
The Module that issues and consumes one-use **Injection Grants** for exact **Runtime Injection Policy Versions** or allowed non-protected one-command selections.
_Avoid_: reusable session token, local policy file, Secret Reveal path

**Command Fingerprint**:
A stable identifier for the command inputs approved by a runtime injection policy.
_Avoid_: command name when the approved command identity is meant

**Runtime Trust Boundary**:
The point after runtime injection where the child process can read delivered secret values.
_Avoid_: sandbox when no isolation guarantee exists

**Command Output Boundary**:
The rule that runtime-injected child process stdout and stderr are not captured or stored by insecur.
_Avoid_: command log when stdout/stderr is meant

**Forensic Traceability**:
The ability to reconstruct which actor, policy, command, secret versions, and delivery path caused a security-relevant event.
_Avoid_: observability when the security investigation trail is meant

**CLI Profile**:
A named non-secret CLI context that selects host, organization, project, environment, and default runtime policy.
_Avoid_: profile when user identity, provider account, or a secret set is meant, profile; use CLI Profile for a named local command/deploy context

**CLI Profile Slug**:
A short lower-kebab local alias for one CLI Profile, unique inside the User's local CLI configuration and used for command selection.
_Avoid_: Display Name when the selector is meant, Opaque Resource ID when the local alias is meant, profile name when the command selector is meant; a CLI Profile Display Name may be freeform and is not a selector

**Secret Reveal**:
Secret egress that returns a plaintext secret value to the caller.
_Avoid_: read, get when the exposure of plaintext is meant

**Secret Use**:
Permission to cause secret delivery without receiving the plaintext secret value.
_Avoid_: access when it could be confused with secret reveal

**First Value Proof**:
A provider-free first-run demonstration of **Diskless Development Secret Use** that uses ordinary CLI commands for a service-generated **Blind Secret Write** and local **Runtime Injection**.
_Avoid_: agent-proof secret, production readiness proof, provider setup test, agent never reads the value not used for non-protected local Runtime Injection; First Value Proof demonstrates delivery-without-reveal in caller output, child process can read injected values after the Runtime Trust Boundary, first-run proof command; First Value Proof uses normal secret-write and runtime-injection commands

**Agent-Reachable Channel**:
An interaction path an **Agent** can drive with an inherited human session, **Machine Identity**, or local automation credential, such as CLI commands, API calls, and operation polling.
_Avoid_: CLI-only when API access is also possible

**Human Approval Surface**:
The authenticated web app surface where a **User** reviews high-risk action impact, satisfies **High-Assurance Challenges**, and confirms protected delivery decisions outside an agent-controlled terminal.
_Avoid_: approval email, terminal approval, notification when review authority is meant, email approval; approval happens in the authenticated approval view, not in email, terminal approval not used for Protected Environment approval in V1; use Human Approval Surface for the approval and Agent-Reachable Channel for request/poll behavior

**Delivery Risk Policy**:
An **Organization Configuration** or project/environment-scoped policy that controls which **Secret Delivery**, deployment, approval, and confirmation paths are allowed for non-protected, preview, and protected workflows.
_Avoid_: blanket agent permissions, production shortcut, let the agent deploy production is a rejected Delivery Risk Policy shape for Protected Environments in V1, agent can deploy preview allows non-protected preview delivery through Agent-Reachable Channels

**Delivery Risk Policy Preset**:
A named user-facing choice that applies a versioned **Delivery Risk Policy** template, such as Strict, Balanced, or Automation-Friendly.
_Avoid_: custom policy language when the V1 preset surface is meant, security level when delivery-channel policy is meant, sane defaults when discussing delivery-channel risk posture, custom risk policy is a future enterprise policy surface unless the current V1 Delivery Risk Policy Preset model is meant

**Risk-Broadening Delivery Change**:
A **Delivery Risk Policy**, **Delivery Risk Policy Preset**, or delivery configuration change that increases **Agent-Reachable Channel** authority for **Secret Delivery**, deployment, approval, or confirmation.
_Avoid_: policy upgrade when security posture may be getting looser, loosen the preset

**Risk-Tightening Delivery Change**:
A **Delivery Risk Policy**, **Delivery Risk Policy Preset**, or delivery configuration change that reduces **Agent-Reachable Channel** authority for **Secret Delivery**, deployment, approval, or confirmation.
_Avoid_: policy downgrade when security posture may be getting stricter, tighten the preset

**Preview Automation Opt-In**:
An explicit environment-scoped setting that allows **Agent-Reachable Channels** to execute already-configured delivery actions for one non-protected preview **Environment** under the Balanced **Delivery Risk Policy Preset**.
_Avoid_: project-wide preview automation, preview default when explicit environment enablement is meant, turn on preview automation under the Balanced Delivery Risk Policy Preset, project-wide preview automation not used for Balanced; Preview Automation Opt-In is environment-scoped in V1

**Preview Automation Authority**:
The bounded authority to execute already-configured **Runtime Injection Policies** and **Secret Syncs** for a non-protected preview **Environment**, granted by **Preview Automation Opt-In** under Balanced or by the Automation-Friendly **Delivery Risk Policy Preset**.
_Avoid_: preview admin, provider setup authority, arbitrary preview secret access, preview automation can configure providers; Preview Automation Authority executes already-configured delivery only, Automation-Friendly can configure preview delivery not used; grants execution-only Preview Automation Authority by default for non-protected preview Environments in scope
