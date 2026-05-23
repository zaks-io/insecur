# Security Plan

This document tracks the security plans insecur must account for while staying developer-first and agent-friendly. It is planning material, not a claim that the current scaffold already implements these controls.

## Security Posture

insecur stores valuable secrets, provider credentials, machine identity credentials, and audit records. The default posture should be conservative:

- Authenticate every actor.
- Authorize every object access through organization/project membership.
- Encrypt every sensitive value and Sensitive Metadata before D1 persistence.
- Never persist plaintext secret values or provider credentials on insecur-controlled systems.
- Never log plaintext secret values or provider credentials.
- Accept secret values, provider credentials, deploy keys, bootstrap secrets, and OIDC tokens only through safe sensitive input paths.
- Prefer short-lived credentials and provider app connections over copied static keys.
- Make every high-risk operation auditable, scriptable, resumable, and reversible where possible.
- Make secure behavior the easiest behavior for humans, agents, and CI.

V1 production use starts only after the public multi-tenant-capable security baseline is implemented. The first real organization may be Isaac's own organization, but that does not lower the authorization, cryptography, audit, machine access, or release-gate requirements.

The v1 security focus is secure storage plus controlled delivery: insecur is the Secret Source of Truth, provider syncs are derived delivery targets for Cloudflare, Vercel, and GitHub, and runtime injection delivers values just in time for deploys and local commands without writing local secret files.

Production Secret Sync and Runtime Injection are blocked until the Storage Security Gate is complete: root key material outside D1, organization and project data keys, key version tracking, provider credentials and Sensitive Metadata encrypted under tenant-bound data keys, and AES-GCM authenticated data binding ciphertext to organization, project, environment, secret, version, app connection, provider credential, and sensitive metadata identity.

## Threat Model

Primary assets:

- Secret values and secret versions.
- Organization data keys, project data keys, and per-record data encryption keys.
- App connection credentials for Vercel, GitHub, and Cloudflare.
- Machine identity auth method credentials and access tokens.
- Session cookies and refresh credentials.
- Audit log integrity.

Important attacker goals:

- Read secrets from another organization or project.
- Write or rollback secrets without permission.
- Use a stolen token after it should have expired or rotated.
- Abuse a provider connection to push or exfiltrate secrets.
- Replay ciphertext or move encrypted records across tenants.
- Suppress, forge, or evade audit records.
- Trick agents or CLI scripts into leaking secrets to stdout, JSON output, logs, shell history, model context, or committed files.
- Cause insecur to persist or log plaintext secrets through errors, audit metadata, provider responses, queues, caches, traces, or analytics.
- Smuggle sensitive values through URLs, query strings, route params, command arguments, shell history, browser history, process listings, or telemetry.
- Abuse expensive endpoints or sync jobs for denial of service.
- Compromise the build/dependency supply chain.

Explicit non-goals for the near term:

- Enterprise identity surfaces such as SCIM, SAML, and LDAP.
- HSM/KMIP/FIPS modes.
- Broad dynamic secret engines.
- Large custom policy languages.

## Security Plans

### 1. Authentication And Session Plan

Use WorkOS AuthKit for human authentication, but treat login as identity and authentication assurance only. Authorization must come from organization and project memberships.

Plan for:

- WorkOS AuthKit hosted login or callback flow with exact redirect URI matching.
- `state` and PKCE where supported.
- Issuer/provider mix-up defenses if multiple OAuth providers are added.
- Secure, HttpOnly, SameSite cookies for browser sessions.
- CSRF protection on browser-originating mutations.
- Idle and absolute session lifetime limits.
- Session rotation after login, privilege changes, MFA changes, and recovery events.
- WorkOS-backed MFA is required before v1 production use.
- High-risk human actions should require a fresh MFA challenge or equivalent high-assurance session.
- SMS is not allowed as a primary or recovery MFA factor.
- Initial MFA should use WorkOS AuthKit passkeys or TOTP-backed high-assurance sessions.
- Insecur user records should map to stable WorkOS user identifiers, not mutable emails.
- Recovery should use recovery codes, organization-owner recovery, or audited break-glass access instead of SMS fallback.
- Explicit, audited break-glass access limited to organization owners.

Agent/DX requirements:

- CLI auth must work in non-interactive environments.
- Browser login may exist for humans, but CI and agents should use OIDC or a narrow bootstrap auth method.
- Human CLI credentials are memory/session-only; no access token, refresh token, or session token is written to disk.
- The CLI may launch an authenticated subshell or one-shot command with a short-lived token in the child environment, but must not persist that token.
- Deploy automation may use environment-scoped deploy keys for Runtime Injection. Deploy keys exchange for short-lived access tokens and cannot cross project or environment boundaries.
- Deploy keys are attached to an explicit allowlist of Runtime Policy Key IDs.
- Deploy keys cannot request arbitrary secrets, secret sets, command shapes, or Command Fingerprints.
- Runtime Injection Policies own the deployable secret set and command boundary.
- Deploy keys must not authorize Secret Sync. Secret Sync is server-side and uses App Connections for provider authorization.
- Environment deploy key expiration and rotation are configurable through a Deploy Key Rotation Policy.
- Non-expiring deploy keys are allowed only when explicitly configured and visible in status, plan, and audit output.
- Deploy key create, exchange, denial, rotation, expiration, and disable events are audited.
- Auth errors need stable machine-readable codes such as `auth.expired`, `auth.insufficient_scope`, `auth.mfa_required`, and `auth.reauth_required`.
- Non-interactive CLI and CI flows must never depend on human SMS verification.

### 2. Authorization And Tenancy Plan

Object-level authorization is the main security boundary. Plaintext slugs or names are not v1 durable selectors and must not replace membership checks.

Plan for:

- Organization-qualified routes.
- Opaque resource IDs for durable server-side selectors.
- Sensitive Display Names encrypted as Sensitive Metadata and decrypted only after authorization.
- Membership checks for every list, read, write, rollback, token, audit, app connection, and sync operation.
- Role checks at organization and project scope.
- Deny-by-default permission evaluation.
- Identical public behavior for missing resources and cross-tenant forbidden resources.
- Cross-tenant regression tests for ID-based access, missing resources, and forbidden resources.
- Safe invitation and membership removal behavior.
- Tenant-bounded audit export and tenant deletion.

Agent/DX requirements:

- `.insecur.json` stores non-secret defaults using opaque IDs only: host, organization ID, project ID, environment ID, and optional profile ID.
- API authorization must never trust client-provided IDs without tenant-qualified lookup and membership checks.
- CLI commands should not require repeating organization/project/env flags after `insecur init`.
- CLI errors should explain the missing permission without revealing cross-tenant resource existence.

### 3. Cryptography And Key Management Plan

Encryption should provide tenant isolation and support routine rotation.

Plan for:

- Instance root key material stored outside D1.
- Organization data keys for organization-level encrypted data.
- Project data keys for project secret data.
- Organization data keys are the baseline boundary for Sensitive Metadata. Project data keys may protect project-scoped Sensitive Metadata where that tighter boundary is available.
- Per-record or per-version data encryption keys where useful.
- Key version records with `active`, `retired`, and `revoked` states.
- AES-256-GCM authenticated data binding ciphertext to organization, project, environment, secret, and version identity.
- AES-256-GCM authenticated data binding provider credential ciphertext to organization, app connection, provider, credential, and key version identity.
- AES-256-GCM authenticated data binding Sensitive Metadata ciphertext to organization, project/resource when applicable, metadata type, record, field, and key version identity.
- Plaintext lookup/index fields are limited to opaque resource IDs. Secret names, provider target names, policy binding names, and security-relevant relationships are encrypted Sensitive Metadata.
- V1 does not include general search over Sensitive Metadata. Identification uses Scoped Lists, Configured Selectors, opaque IDs, and authorized detail views.
- Sensitive Display Names can be decrypted for authorized list/detail responses, but must not be copied into plaintext search indexes.
- Rotation that rewraps data keys or per-record DEKs instead of exposing plaintext secret values.
- Emergency restore path that can decrypt retired keys under explicit operator control.
- Key rotation audit events and verification reports.
- Storage Security Gate verification before production Secret Sync or Runtime Injection can be enabled.
- Production app connection credential storage and use require organization data keys, key versions, and authenticated-data binding.

Agent/DX requirements:

- `insecur keys plan-rotation --json` shows scope, affected records, and expected steps.
- `insecur keys rotate --operation <id>` is resumable and idempotent.
- `insecur keys verify --operation <id> --json` returns machine-readable status.
- No key bytes, DEKs, plaintext secrets, or provider tokens ever appear in CLI output.
- Delivery features may be implemented behind development flags before this gate, but production Secret Sync and Runtime Injection must fail closed until tenant-bound encryption for Secrets, Provider Credentials, and Sensitive Metadata is verified.

### 4. Secret Lifecycle Plan

Secrets need lifecycle operations beyond CRUD.

Plan for:

- Immutable secret versions.
- Serialized writes and rollback.
- Rollback implemented as a new version created from an older encrypted payload.
- Protected Environment writes create Draft Versions until explicitly promoted.
- Protected Environment Secret Delivery uses only Published Versions.
- Promotion is an audited lifecycle event that makes a version eligible for Runtime Injection and Secret Sync.
- Emergency rollback creates and promotes a new version from a retained encrypted prior Published Version without revealing plaintext to the caller.
- Rollback eligibility is controlled by a configurable Rollback Retention Window; expired versions are no longer delivery- or rollback-eligible.
- Optional expiration metadata for secrets that should not live forever.
- Secret rotation reminders and, later, provider-assisted rotation workflows.
- Secret import paths and secret delivery paths that are tenant-bounded and audited.
- Secret values must enter through safe sensitive input paths such as request bodies over TLS, CLI stdin, masked prompts, or provider authorization flows.
- Secret values must never be accepted in URLs, query strings, route params, CLI arguments, shell-visible flags, or GET requests.
- No plaintext in D1, logs, error messages, cache, analytics, or durable job payloads.
- No plaintext in R2 backups, Queue messages, Durable Object state, KV, analytics events, traces, audit metadata, request logs, response logs, local config, or generated operation records.
- No raw request bodies, provider response bodies, command environments, or decrypted secret maps in logs.
- No runtime-injected command stdout/stderr capture or storage.
- Plaintext secret values may exist only inside approved delivery execution paths, such as encryption/decryption, runtime injection, provider sync, and rotation.
- Plaintext secret values in approved execution paths are transient process memory only and must be excluded from structured output, errors, audit metadata, and durable retry payloads.
- Provider secret stores and child process environments are delivery destinations, not the Secret Source of Truth.
- Secret reveal to a caller is not supported for Protected Environment secrets, including for organization owners and operators.
- Production environments are Protected Environments by default.
- Setting a Protected Environment secret does not immediately affect provider sync or runtime injection; explicit Promotion is required.
- Old values kept for rollback are retained as encrypted Secret Versions only, never as plaintext backup copies.
- Agents may receive Secret Use through Runtime Injection or Secret Sync, but must not receive Secret Reveal for Protected Environment secrets.
- Non-protected environments may copy Secret Shapes from Protected Environments, but must never copy protected secret values.
- Environment Defaults are values set specifically for non-protected environments and may be delivered locally according to that environment's policy.
- Shared values across environments must be modeled as explicit Shared Secret Sources with named environment attachments, not environment inheritance or value copying.
- A Shared Secret Source attached to a Protected Environment uses the strictest egress policy from its attached Environments.
- Protected Environment runtime injection requires a server-owned Runtime Injection Policy.
- Local project config may reference a Runtime Injection Policy by opaque Runtime Policy Key, but must never be trusted as the authorization rule.
- Runtime Injection Policies require Command Fingerprints for Protected Environment delivery when practical and issue only fresh, short-lived, one-use Injection Grants.
- Injection Grants are non-reusable. Every Runtime Injection execution requires a new server-issued grant even within an authenticated CLI session.
- Runtime Injection Policies use exact secret bindings only; wildcard, prefix, suffix, regex, tag, folder, or pattern-based secret selection is not supported.
- A Runtime Policy Key resolves to one Runtime Injection Policy and that policy resolves to a specific secret set.
- Runtime Injection Policy changes create immutable Runtime Injection Policy Versions. Used versions cannot be mutated because historical grants must remain reconstructable.
- Runtime Injection Policy Versions are retained indefinitely as non-plaintext audit metadata. This retention is separate from encrypted secret value rollback retention.
- Runtime Injection Policy Versions store immutable secret IDs and historical secret/display names for exact bindings. Those names are Sensitive Metadata and require access-controlled reads and exports.
- Runtime Injection Policy Version Sensitive Metadata is encrypted at rest under tenant-bound data keys. Opaque IDs remain available for lookup and audit joins.
- Every Injection Grant references the exact Runtime Injection Policy Version used to authorize it.
- Exact bindings are required for forensic traceability during incident review.
- Command Fingerprints may cover selected scripts, package manifests, lockfiles, compiled artifacts, or an explicit command bundle.
- Runtime Injection crosses the Runtime Trust Boundary when the child process starts; the product cannot prevent an approved child process from reading or leaking its delivered environment.
- V1 supports two production delivery paths: Secret Sync to provider secret stores and dynamic Runtime Injection into approved commands.
- Dynamic Runtime Injection is the higher-security path for high-sensitivity secrets when the workflow can support it because it avoids a persistent provider-side copy and keeps authorization, revocation, and audit in insecur.
- Secret Sync is the compatibility and native-platform path; it intentionally creates a persistent copy in the provider's secret store until rotation, overwrite, or deletion.

Agent/DX requirements:

- `insecur secrets set` and `insecur secrets rollback` support `--comment`, `--json`, and stable exit codes.
- `insecur secrets promote` explicitly publishes a Protected Environment version for delivery.
- `insecur secrets rollback --promote` performs emergency rollback from a retained encrypted prior Published Version.
- CLI secret values and provider credentials are accepted by stdin, masked prompt, or provider flow only; no `--value <secret>`, `--token <secret>`, or `--client-secret <secret>` flags.
- `insecur run` delivers secrets only through runtime injection to a child process environment.
- `insecur run` for Protected Environment secrets requires a Runtime Injection Policy and one-use Injection Grant.
- CLI Profiles may select organization, project, environment, and default runtime policy, but must not contain secret values.
- `insecur run <profile-id> -- <command>` supports deploy and local command injection without local secret files.
- The v1 runtime wrapper may be the CLI process itself: fetch an Injection Grant, load approved secret values into process memory, fork/exec the approved child with environment variables, and avoid stdout, JSON, logs, and disk.
- A separate resident local helper is not required for v1 unless it provides a concrete boundary beyond direct in-memory CLI injection.
- GitHub Actions and other provider destinations may receive production secrets through audited Secret Syncs when native platform storage is the desired delivery boundary.
- Protected Environment Secret Syncs to GitHub Actions must target GitHub Environment secrets by default.
- Protected Environment GitHub Actions syncs require the GitHub Environment to already exist; insecur must not auto-create it during sync setup or execution.
- Protected Environment GitHub Actions syncs block unless the target GitHub Environment has visible protection rules.
- The exact GitHub Environment Protection rule matrix is deferred until the GitHub sync implementation pass.
- Repository-scoped GitHub Actions secrets are allowed only as an explicit high-risk override because they are broader inside the target repository.
- File delivery is denied for Protected Environment secrets by default and, if supported for local development or legacy tooling, must require explicit opt-in, mode `0600`, overwrite protection, and repository safety checks.
- Agent-facing output reports delivery metadata only and must not contain secret values.
- Break-glass workflows for Protected Environment secrets may permit additional Secret Delivery, rotation, replacement, or provider reauthorization, but must not reveal plaintext values to a caller.
- Shared Secret Source create/update/attach/detach operations are audited and require high-risk action controls when any attached environment is protected.
- Runtime Injection Policy create/update/disable, Runtime Injection Policy Version publish/disable, and Injection Grant issue/use/deny events are audited.
- Injection Grant issue/use/deny/reuse-deny audit events record actor, auth method, Runtime Policy Key, Runtime Injection Policy ID, Runtime Injection Policy Version ID/hash, exact secret binding IDs, delivered secret version IDs, Command Fingerprint, whether the fingerprint matched policy, request ID, result, and denial reason where applicable.
- Deploy key exchange audit events record the requested Runtime Policy Key, Runtime Injection Policy ID, Runtime Injection Policy Version ID/hash, deploy key ID, and whether that policy was attached to that deploy key.
- Runtime Injection completion audit events may record exit code, signal, start/end timestamps, and duration, but never stdout/stderr.
- Audit events never record plaintext secret values.

### 5. App Connection And Sync Plan

Provider access should be owned by app connections, not scattered credentials.

The concrete CLI and sync workflow is specified in [cli-and-sync.md](cli-and-sync.md).

Plan for:

- Organization-owned app connections.
- Provider-specific connection methods.
- GitHub App installation for GitHub Actions secrets.
- GitHub Actions sync targets include one repository plus, for protected production delivery, one GitHub Environment.
- GitHub Environment existence and visible protection status are checked during create/enable and planning, then rechecked before each protected sync decrypts or writes values.
- Vercel Integration OAuth for Vercel environment variables.
- Scoped Cloudflare API tokens for Cloudflare Worker secrets until a suitable Cloudflare app/OAuth install flow exists for that API.
- No global provider API keys.
- Encrypted provider credentials with key version metadata.
- Provider credentials are organization-owned sensitive data and must be encrypted under organization data keys before production use.
- Production app connections and Secret Sync must fail closed when provider credential storage has not passed the Storage Security Gate.
- Provider credentials must enter through provider authorization flows, request bodies over TLS, CLI stdin, or masked prompts.
- Provider credentials must never be accepted in URLs, query strings, route params, CLI arguments, shell-visible flags, or GET requests.
- Provider disconnect, credential rotation, and reauthorization workflows.
- Manual scoped provider tokens require least-privilege setup guidance, provider-side revocation instructions, expiration/rotation tracking where possible, and audit events for creation, test, use, rotation, and deletion.
- Cloudflare app connections require an explicit connection boundary. Account-level Cloudflare tokens are allowed only when narrower provider permissions are unavailable, and secret syncs must pin allowed Workers and environments.
- Project-owned secret syncs that reference app connections.
- Sync dry-run, diff, queue-backed execution, retry, dead-letter handling, and audit events.
- Sync job idempotency to avoid partial duplicate writes.
- Durable Object serialization per organization/provider/target to prevent concurrent provider writes from racing.
- Sync audit trails that include enqueue, lock acquisition, provider write summaries, retry, dead-letter, completion, cancellation, and lock release events.

Agent/DX requirements:

- `insecur connections list --json` never returns credentials.
- `insecur sync plan --json` shows target changes without exposing values.
- `insecur sync run --operation <id>` is resumable.
- Queue messages store operation IDs and target metadata, never plaintext secret values or provider credentials.
- Operation status should expose enough state for agents to distinguish queued, locked, running, retrying, waiting for reauthorization, dead-lettered, failed, and completed states.
- Provider errors are normalized enough for agents to decide whether to retry, reauth, or stop.

### 6. Audit, Monitoring, And Detection Plan

Audit logs are part of the product, not a debug feature.

Plan for:

- Tenant-qualified audit rows with organization ID and optional project ID.
- Typed actor, auth method, event type, resource, IP, user agent, request ID, result, and metadata.
- Allowlisted audit metadata fields; never store plaintext secret values, provider credentials, key material, decrypted request bodies, decrypted provider bodies, or child process environments.
- Denied authorization events, including denied cross-tenant attempts.
- Auth failure and refresh-token reuse events.
- Secret metadata read, write, promotion, rollback, retention policy, import, egress, runtime injection, and sync events.
- App connection create/update/delete/use/reauth events.
- Key rotation and restore events.
- Tamper-evident audit exports using tenant-bounded JSONL entries, a per-export hash chain, and an HMACed manifest.
- Audit export manifests that include organization, time range, entry count, first hash, last hash, hash algorithm, HMAC key version, and HMAC.
- Full-fidelity audit exports may include Sensitive Metadata such as historical secret/display names, provider target names, and policy binding names only for authorized security review.
- Low-privilege audit exports use immutable IDs and hashes and exclude Sensitive Metadata that reveals security-relevant structure.
- HMAC verification for export integrity and authenticity, with asymmetric signing deferred unless third-party verification becomes a product requirement.
- Basic anomaly detection later: unusual source IP, high-volume reads, repeated denied access, sync failures.

Agent/DX requirements:

- `insecur audit tail --json` for local diagnosis.
- `insecur audit export --org-id <id> --from <time> --to <time>` with tenant-bounded scope.
- `insecur audit verify <export>` for checking the hash chain and HMACed manifest.
- Stable event names that tests and agents can assert against.
- Canary leak tests that prove secret-shaped values do not appear in logs, audit metadata, errors, traces, analytics, or operation records.

### 7. Abuse Resistance And Runtime Hardening Plan

Secrets systems need boring defensive defaults.

Plan for:

- Rate limits by actor, organization, endpoint class, and IP.
- Separate limits for auth, secret reads, secret writes, syncs, and rotation jobs.
- Request size limits and strict JSON parsing.
- Input validation for opaque IDs, Sensitive Display Names, provider IDs, and redirect targets.
- No broad plaintext search indexes over Sensitive Metadata in v1. List endpoints must be scope-bounded and authorization-checked before Sensitive Display Names are decrypted.
- Reject sensitive values in URLs, query strings, route params, GET requests, CLI argv, and other unsafe input paths.
- Security headers including CSP once a UI exists.
- No caching for `/v1/*` secret-bearing responses.
- Structured, non-sensitive error responses.
- Centralized structured logging with allowlisted fields and no request/response body logging for secret-bearing routes.
- Request IDs on every response.
- Idempotency keys for high-risk mutations.
- Safe default CORS policy.

Agent/DX requirements:

- Rate-limit responses include machine-readable retry metadata.
- Idempotency lets agents safely retry after network failures.
- Validation errors identify the bad field without echoing secret values.
- Provider error normalization stores provider codes and safe summaries only, never raw provider payloads that may contain submitted secret values.
- Automated tests cover safe sensitive input path enforcement for API routes and CLI commands.

### 8. Backup, Restore, And Deletion Plan

Backup and restore are security features for availability and recovery.

Plan for:

- Encrypted R2 backups for D1 exports.
- Separate backup key material from runtime key material where practical.
- Restore tests before v1 production use.
- Tenant-scoped export and deletion workflows.
- Recovery drills for root key loss, data key corruption, provider credential compromise, and accidental secret deletion.
- Documented limits: if root key material is lost, encrypted data is unrecoverable.

Agent/DX requirements:

- `insecur backup create --json`, `insecur restore plan --json`, and `insecur restore verify --json`.
- Restore plans show impacted organizations/projects before execution.
- Destructive operations require explicit confirmation flags in non-interactive mode.

### 9. Secure SDLC And Supply Chain Plan

The repository should make security regressions hard to merge.

Plan for:

- Security checklist mapped to OWASP ASVS Level 2 where applicable.
- API checks mapped to OWASP API Security Top 10.
- Dependency vulnerability scanning.
- Secret scanning in git history and CI.
- Lockfile integrity checks.
- Least-privilege GitHub Actions permissions.
- Branch protection and required checks before production deploy.
- Dependency update cadence.
- Minimal Worker secrets and documented secret inventory.
- Reproducible build/deploy notes for Cloudflare Workers.
- Security review for new auth methods, app connections, sync destinations, and encryption changes.

Agent/DX requirements:

- A single `pnpm security:check` script should eventually run the local security gate.
- Security findings should have stable categories so agents can triage and file issues.
- Docs should include copy-pasteable commands that are safe by default.

## Security Runbooks To Write

Write these before relying on insecur for valuable production secrets:

- First tenant bootstrap.
- User invitation and offboarding.
- Lost or compromised human session.
- Machine identity credential compromise.
- App connection compromise or provider disconnect.
- Secret value rotation.
- Root key rotation.
- Organization data key rotation.
- Project data key rotation.
- Failed or interrupted rotation job.
- D1 restore from encrypted backup.
- Tenant export and deletion.
- Tamper-evident audit export and verification.
- Suspicious audit activity investigation.
- Emergency break-glass access.
- Protected Environment secret replacement without reveal.
- Protected Environment emergency rollback from retained encrypted version.

Each runbook should include:

- When to use it.
- Preconditions and required role.
- CLI dry-run command.
- Execution command.
- Verification command.
- Audit events expected.
- Rollback or recovery notes.

## Security Release Gates

Before v1 production use, require:

- Threat model reviewed against this document.
- Cross-tenant authorization tests for all tenant-owned resources.
- Storage Security Gate passed: root key material outside D1, organization and project data keys, key versions, provider credentials and Sensitive Metadata encrypted under tenant-bound data keys, and AES-GCM authenticated data binding ciphertext to organization/project/environment/secret/version, organization/app-connection/provider-credential, and sensitive metadata identity.
- Production Secret Sync and Runtime Injection fail closed when the Storage Security Gate has not passed.
- Protected Environment Promotion, Draft Version non-delivery, rollback, and Rollback Retention Window behavior tested.
- No Plaintext Persistence and Secret-Free Logging tests pass with canary secret values across API, CLI, sync, runtime injection, errors, audit events, operation records, and worker logs.
- Sensitive Metadata Encryption tests prove Sensitive Display Names are encrypted at rest, absent from plaintext indexes, and only decrypted for authorized Scoped Lists or detail responses.
- Safe Sensitive Input Path tests prove secret values, provider credentials, deploy keys, bootstrap secrets, and OIDC tokens are rejected from URLs, query strings, route params, CLI arguments, and GET requests.
- Auth/session behavior reviewed against RFC 9700 and OWASP auth/session guidance.
- MFA and high-risk action challenge behavior tested for organization owners and administrators.
- Security checks mapped to OWASP ASVS Level 2 where applicable.
- API checks mapped to OWASP API Security Top 10.
- Key rotation plan and at least one successful restore drill.
- App connection revocation/reauthorization tested for every supported provider.
- Audit export verified for tenant boundaries, hash-chain integrity, HMAC manifest validation, and low-privilege Sensitive Metadata exclusion.
- CLI agent flows tested in non-interactive mode.
- Dependency and secret scanning enabled in CI.

## References

- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.ietf.org/rfc/rfc9700.html)
- [OWASP Application Security Verification Standard](https://github.com/OWASP/ASVS)
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x00-header/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- [NIST SP 800-57 Part 1](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final)
- [NIST SP 800-218 Secure Software Development Framework](https://csrc.nist.gov/pubs/sp/800/218/final)
