# ADR-0016: Delivery-First Secret Egress

Date: 2026-05-23

Status: Accepted

V1 will distinguish secret use, secret delivery, and secret reveal. Plaintext secret values may exist inside approved execution paths for runtime injection, provider sync targets, encryption/decryption workflows, or rotation workflows, but default API, CLI, UI, JSON, logs, audit metadata, queue payloads, and agent-facing output must not return plaintext secret values to the caller. Protected Environment secrets do not support secret reveal, even for organization owners and operators; break-glass may permit additional Secret Delivery, rotation, replacement, or provider reauthorization, but not plaintext disclosure to a caller. Agents may receive Secret Use through Runtime Injection or Secret Sync without putting production secrets directly into model context, terminal scrollback, or structured logs.

Plaintext secret values and provider credentials must never be persisted or logged on insecur-controlled systems. Approved execution paths may hold plaintext only as transient process memory, and observability must use allowlisted metadata rather than redaction after the fact.

Sensitive values must enter insecur only through safe input paths: request bodies over TLS, CLI stdin, masked prompts, or provider authorization flows. Secret values, provider credentials, deploy keys, bootstrap secrets, and OIDC tokens must never be accepted in URLs, query strings, route params, CLI arguments, or GET requests.

insecur is the Secret Source of Truth. Provider secret stores and child process environments are delivery destinations derived from insecur's current secret versions.

Production delivery depends on the Storage Security Gate. Secret Sync and Runtime Injection must fail closed until tenant-bound encryption for Secrets, Provider Credentials, and Sensitive Metadata is implemented and verified.

Non-protected environments may copy Secret Shapes from Protected Environments, but never protected secret values. Development delivery uses values or Environment Defaults set specifically for the non-protected environment.

Values shared across environments are modeled as explicit Shared Secret Sources with named environment attachments. Environments do not inherit values from other environments, and attaching or detaching a Shared Secret Source never copies a protected value into another environment.

Protected Environment delivery uses Published Versions only. Draft Versions are stored but not eligible for Runtime Injection or Secret Sync until explicitly promoted. Emergency rollback creates and promotes a new version from a retained encrypted prior Published Version without revealing plaintext.

V1 supports two production delivery paths. Secret Sync writes values to provider secret stores such as GitHub Actions secrets, which is useful for native provider workflows but intentionally creates a persistent provider-side copy. Protected Environment syncs to GitHub Actions target existing GitHub Environment secrets inside the selected repository by default, insecur must not auto-create those GitHub Environments, and protected sync blocks when the GitHub Environment has no visible protection rules. Dynamic Runtime Injection delivers values just in time to an approved command and is preferred for high-sensitivity Protected Environment secrets when the workflow can authenticate at execution time.

Protected Environment Runtime Injection is authorized by server-owned Runtime Injection Policies, not local config. The CLI may cache or name a policy locally, but every protected run requires the server to validate the actor, environment, command shape, optional Command Fingerprint, and exact secret bindings before issuing a fresh, short-lived, one-use Injection Grant. Injection Grants are non-reusable; an authenticated CLI session may persist briefly in memory, but grants are never reused across runs.

Runtime Injection Policy changes create immutable Runtime Injection Policy Versions. The editable policy object may point at a new active version, but every Injection Grant references the exact Runtime Injection Policy Version used, including its exact secret bindings, command constraints, TTL, fingerprint requirements, and delivery behavior. Used Runtime Injection Policy Versions are not mutated because incident review must reconstruct the authorization state that existed when the grant was issued. Runtime Injection Policy Versions are retained indefinitely as non-plaintext audit metadata, separate from encrypted secret value rollback retention. They store immutable secret IDs and historical secret/display names for exact bindings; those names are Sensitive Metadata, not plaintext secrets, and require access-controlled reads and exports.

Runtime Injection Policies do not support wildcard, prefix, suffix, regex, tag, folder, or pattern-based secret selection. A policy key resolves to one policy, and that policy's active version resolves to a specific secret set.

This exact binding model is required for forensic traceability. Injection Grant audit events must show which actor, auth method, policy key, Runtime Injection Policy Version, command fingerprint, secret bindings, and delivered secret version IDs were involved, without storing plaintext values.

insecur must not capture or store stdout/stderr from runtime-injected child processes. Runtime Injection audit may record command metadata, timing, exit code, signal, policy, fingerprint, and delivery identifiers, but not command output.

The v1 Runtime Injection wrapper can be the CLI process itself: fetch an Injection Grant, hold approved plaintext values only in process memory, fork/exec the approved child with environment variables, and avoid stdout, JSON, logs, shell history, and disk. A separate local helper process is deferred unless it creates a concrete security boundary beyond direct in-memory CLI injection.

Command Fingerprints are required for Protected Environment Runtime Injection when practical and may hash selected scripts, package manifests, lockfiles, compiled artifacts, or an explicit command bundle. This reduces accidental or unreviewed command drift, but the Runtime Trust Boundary starts when the approved child process receives its environment; the product cannot prevent that process from reading or leaking values it was intentionally given.
