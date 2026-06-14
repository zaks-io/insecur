# Sensitive Data And Safety Gates

Glossary slice for agents. Term definitions are authoritative here and single-sourced;
do not copy them into package context files. Index and routing: [`../../../CONTEXT.md`](../../../CONTEXT.md).
Term relationships: [`../relationships.md`](../relationships.md). Usage examples: [`../dialogue.md`](../dialogue.md).

## Sensitive Data And Safety Gates

**Secret Egress**:
A controlled event where a plaintext secret value leaves encrypted storage for an approved destination.
_Avoid_: export when the broader movement of plaintext is meant

**Secret Delivery**:
Secret egress that supplies a plaintext secret value to an approved destination without returning it to the caller.
_Avoid_: reveal, print

**No Plaintext Persistence**:
The rule that Sensitive Values are never written to durable storage on insecur-controlled systems.
_Avoid_: encrypted at rest when plaintext persistence is the issue

**Secret-Free Logging**:
The rule that logs, traces, errors, audit metadata, and analytics never contain Sensitive Values.
_Avoid_: redacted when the value should never enter the log path, redact secrets is too weak for observability invariants

**Sensitive Metadata**:
Metadata treated as sensitive by default because it can reveal security-relevant structure, integrations, provider-side targets, provider-side secret or variable names, approval context, device routing, or relationships.
_Avoid_: safe metadata, metadata-only does not mean broadly safe; use Sensitive Metadata when names, targets, or relationships can expose security-relevant structure, provider variable name / provider secret name used by Explicit Provider Lookup or Secret Sync Binding

**Value Length Metadata**:
Metadata describing the encoded byte length of a Text Secret Value. For Protected Environment Secrets, exact Value Length Metadata is Sensitive Metadata.
_Avoid_: safe length, value preview, exact secret length; for Protected Environment Secrets it is Sensitive Metadata

**Sensitive Metadata Encryption**:
The rule that Sensitive Metadata is encrypted at rest under tenant-bound data keys, while only fields on the Plaintext Metadata Allowlist remain plaintext for routing, joins, lookup, and basic navigation.
_Avoid_: metadata-only when storage protection is meant, metadata encryption for security-relevant names, targets, or relationships

**Plaintext Metadata Allowlist**:
The narrow set of ordinary metadata fields allowed to remain plaintext because hiding them would make safe operation and review harder. Its canonical artifact is the checked-in registry in `packages/tenant-store` per [ADR-0070](../../adr/0070-plaintext-metadata-allowlist-registry-and-conformance-gate.md).
_Avoid_: safe metadata, non-sensitive metadata when the field is merely allowed by exception

**Metadata Visibility Policy**:
An Organization Configuration or project/environment-scoped policy that controls which actor classes and surfaces may see ordinary metadata, without assigning privacy sensitivity field by field.
_Avoid_: security level when the visible metadata surface is meant

**Sensitive Detail Gate**:
A High-Assurance Challenge required before decrypted Sensitive Metadata is displayed in a User-facing surface or full-fidelity export.
_Avoid_: normal detail view when session hijack resistance is the issue, view sensitive details; satisfy the Sensitive Detail Gate when decrypted Sensitive Metadata is displayed

**Opaque Resource ID**:
A non-semantic identifier used for durable references, joins, and configured selectors.
_Avoid_: slug when a durable selector is meant, secret name as ID; a non-protected create-or-update shortcut may create a Secret Shape from a Variable Key, but audit and durable resource selection use the generated Opaque Resource ID, server-issued ID / server-generated ID should be a client-minted Opaque Resource ID the server validates for format and tenant-scoped uniqueness

**Display Name**:
A user-authored product label on the Plaintext Metadata Allowlist for navigation, review, Scoped List filtering, and Display Name Resolution after authentication and authorization. Display Names are not Sensitive Values or Sensitive Metadata, but they can leak architectural hints and must not carry confidential content.
_Avoid_: private name when a normal user-authored label is meant, environment name / project name when they are user-authored product labels, human-friendly name / agent-friendly name; use Display Name plus Display Name Resolution, no second plaintext selector

**Scoped-Unique Display Name**:
A Display Name that must be unique within one defined parent scope so command-facing Display Name Resolution cannot be ambiguous.
_Avoid_: global name, slug, opaque ID, unique policy name for Runtime Injection Policy when the command-facing name must be unique inside an Environment

**Default Display Name**:
A product-suggested initial Display Name applied during provisioning or creation, editable by the User and never reserved as authority.
_Avoid_: reserved name, system ID, slug, default policy name when the product suggests an editable initial policy name

**Resolved Target Echo**:
A metadata-only CLI or API output fragment that shows the resolved Opaque Resource ID, Display Name, type, and parent scope for a command target before or after acting.
_Avoid_: confirmation when no human decision is required, selector when the ID is the durable selector, show me what this command targets; echoes resolved ID, Display Name, type, and parent scope

**Scoped List**:
An authorized list bounded by Organization, Project, Environment, or resource scope that may display Display Names after authorization, and decrypted Sensitive Metadata only after authorization and Sensitive Detail Gate.
_Avoid_: search when configured discovery is meant

**Configured Selector**:
An opaque resource ID used to select a configured object without searching or storing plaintext Sensitive Metadata selectors.
_Avoid_: slug, search term

**Display Name Resolution**:
The client-side resolution of a Display Name to exactly one Opaque Resource ID within an already-authorized scope before a command acts.
_Avoid_: search, server-side name selector when only Opaque Resource IDs are durable selectors

**Safe Sensitive Input Path**:
An input path for Sensitive Values that avoids URLs, query strings, route params, command arguments, logs, and shell history.
_Avoid_: value flag or named file input when the value itself is sensitive, pass the secret; use Safe Sensitive Input Path when describing how values enter the system, value flag / value file unsafe for ordinary Secret writes; use stdin, a Masked Secret Prompt, request body, service generation, or provider authorization flow

**Masked Secret Prompt**:
An interactive TTY prompt that accepts a Sensitive Value without echoing it and without writing it to shell history, logs, or command arguments.
_Avoid_: prompt flag when non-interactive input is meant, prompt in CI not used for Secret writes; non-interactive callers must select service generation or stdin input

**Exact Stdin Value Input**:
A Safe Sensitive Input Path where stdin content is accepted as the Sensitive Value without trimming trailing newlines, normalizing line endings, or changing multiline content.
_Avoid_: trimmed stdin, echo-safe input, trim stdin / strip the final newline; use Exact Stdin Value Input

**Explicit Empty Value Write**:
A Blind Secret Write that intentionally stores a zero-length Sensitive Value only after the actor selects an explicit empty-value control.
_Avoid_: accidental empty input, blank means delete

**Misuse-Resistant Defaults**:
A product posture where ordinary management paths are easy, while accidental Sensitive Value exposure paths are absent, denied, or forced through explicit high-risk controls.
_Avoid_: idiot-proof, safe enough

**High-Assurance Challenge**:
A fresh human verification step required before actions that can expose Sensitive Metadata, expand protected delivery, expand provider reach, or change service-level control.
_Avoid_: MFA when the action boundary is meant, agent step-up / let the agent approve is a High-Assurance Challenge the human completes out-of-band; an Agent in a human session cannot satisfy it and resumes the bounded operation after the human clears it

**Destructive Confirmation**:
An operation-scoped explicit confirmation that an actor intends a terminal cleanup or destructive action, without becoming approval evidence or a High-Assurance Challenge.
_Avoid_: approval, MFA when no high-assurance identity proof is required
