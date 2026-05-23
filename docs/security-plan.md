# Security Plan

This document tracks the security plans insecur should account for while staying developer-first and agent-friendly. It is planning material, not a claim that the current scaffold already implements these controls.

## Security Posture

insecur stores valuable secrets, provider credentials, machine identity credentials, and audit records. The default posture should be conservative:

- Authenticate every actor.
- Authorize every object access through organization/project membership.
- Encrypt every sensitive value before D1 persistence.
- Prefer short-lived credentials and provider app connections over copied static keys.
- Make every high-risk operation auditable, scriptable, resumable, and reversible where possible.
- Make secure behavior the easiest behavior for humans, agents, and CI.

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
- Trick agents or CLI scripts into leaking secrets to stdout, logs, shell history, or committed files.
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
- WorkOS-backed MFA is required before public multi-tenant use.
- High-risk human actions should require a fresh MFA challenge or equivalent high-assurance session.
- SMS is not allowed as a primary or recovery MFA factor.
- Initial MFA should use WorkOS AuthKit passkeys or TOTP-backed high-assurance sessions.
- Insecur user records should map to stable WorkOS user identifiers, not mutable emails.
- Recovery should use recovery codes, organization-owner recovery, or audited break-glass access instead of SMS fallback.
- Explicit, audited break-glass access limited to organization owners.

Agent/DX requirements:

- CLI auth must work in non-interactive environments.
- Browser login may exist for humans, but CI and agents should use OIDC or a narrow bootstrap auth method.
- Auth errors need stable machine-readable codes such as `auth.expired`, `auth.insufficient_scope`, `auth.mfa_required`, and `auth.reauth_required`.
- Non-interactive CLI and CI flows must never depend on human SMS verification.

### 2. Authorization And Tenancy Plan

Object-level authorization is the main security boundary. Project slug checks are not enough.

Plan for:

- Organization-qualified routes.
- Project slugs unique within organization only.
- Membership checks for every list, read, write, rollback, token, audit, app connection, and sync operation.
- Role checks at organization and project scope.
- Deny-by-default permission evaluation.
- Identical public behavior for missing resources and cross-tenant forbidden resources.
- Cross-tenant regression tests for ID and slug access.
- Safe invitation and membership removal behavior.
- Tenant-bounded audit export and tenant deletion.

Agent/DX requirements:

- `.insecur.json` stores non-secret defaults using slugs only: host, organization, project, environment, and optional profile.
- Resolved stable IDs may be cached outside the repository, but API authorization must never trust them without tenant-qualified lookup.
- CLI commands should not require repeating organization/project/env flags after `insecur init`.
- CLI errors should explain the missing permission without revealing cross-tenant resource existence.

### 3. Cryptography And Key Management Plan

Encryption should provide tenant isolation and support routine rotation.

Plan for:

- Instance root key material stored outside D1.
- Organization data keys for organization-level encrypted data.
- Project data keys for project secret data.
- Per-record or per-version data encryption keys where useful.
- Key version records with `active`, `retired`, and `revoked` states.
- AES-256-GCM authenticated data binding ciphertext to organization, project, environment, secret, and version identity.
- Rotation that rewraps data keys or per-record DEKs instead of exposing plaintext secret values.
- Emergency restore path that can decrypt retired keys under explicit operator control.
- Key rotation audit events and verification reports.

Agent/DX requirements:

- `insecur keys plan-rotation --json` shows scope, affected records, and expected steps.
- `insecur keys rotate --operation <id>` is resumable and idempotent.
- `insecur keys verify --operation <id> --json` returns machine-readable status.
- No key bytes, DEKs, plaintext secrets, or provider tokens ever appear in CLI output.

### 4. Secret Lifecycle Plan

Secrets need lifecycle operations beyond CRUD.

Plan for:

- Immutable secret versions.
- Serialized writes and rollback.
- Rollback implemented as a new version created from an older encrypted payload.
- Optional expiration metadata for secrets that should not live forever.
- Secret rotation reminders and, later, provider-assisted rotation workflows.
- Secret import/export paths that are tenant-bounded and audited.
- No plaintext in D1, logs, error messages, cache, analytics, or durable job payloads.

Agent/DX requirements:

- `insecur secrets set` and `insecur secrets rollback` support `--comment`, `--json`, and stable exit codes.
- `insecur pull` defaults to stdout for agent pipelines, while `--out` writes mode `0600`.
- Agent-facing output should separate secret values from status/progress messages.

### 5. App Connection And Sync Plan

Provider access should be owned by app connections, not scattered credentials.

The concrete CLI and sync workflow is specified in [cli-and-sync.md](cli-and-sync.md).

Plan for:

- Organization-owned app connections.
- Provider-specific connection methods.
- GitHub App installation for GitHub Actions secrets.
- Vercel Integration OAuth for Vercel environment variables.
- Scoped Cloudflare API tokens for Cloudflare Worker secrets until a suitable Cloudflare app/OAuth install flow exists for that API.
- No global provider API keys.
- Encrypted provider credentials with key version metadata.
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
- Denied authorization events, including denied cross-tenant attempts.
- Auth failure and refresh-token reuse events.
- Secret read/write/rollback/export/pull/run/sync events.
- App connection create/update/delete/use/reauth events.
- Key rotation and restore events.
- Tamper-evident audit exports using tenant-bounded JSONL entries, a per-export hash chain, and an HMACed manifest.
- Audit export manifests that include organization, time range, entry count, first hash, last hash, hash algorithm, HMAC key version, and HMAC.
- HMAC verification for export integrity and authenticity, with asymmetric signing deferred unless third-party verification becomes a product requirement.
- Basic anomaly detection later: unusual source IP, high-volume reads, repeated denied access, sync failures.

Agent/DX requirements:

- `insecur audit tail --json` for local diagnosis.
- `insecur audit export --org <org> --from <time> --to <time>` with tenant-bounded scope.
- `insecur audit verify <export>` for checking the hash chain and HMACed manifest.
- Stable event names that tests and agents can assert against.

### 7. Abuse Resistance And Runtime Hardening Plan

Secrets systems need boring defensive defaults.

Plan for:

- Rate limits by actor, organization, endpoint class, and IP.
- Separate limits for auth, secret reads, secret writes, syncs, and rotation jobs.
- Request size limits and strict JSON parsing.
- Input validation for slugs, secret names, provider IDs, and redirect targets.
- Security headers including CSP once a UI exists.
- No caching for `/v1/*` secret-bearing responses.
- Structured, non-sensitive error responses.
- Request IDs on every response.
- Idempotency keys for high-risk mutations.
- Safe default CORS policy.

Agent/DX requirements:

- Rate-limit responses include machine-readable retry metadata.
- Idempotency lets agents safely retry after network failures.
- Validation errors identify the bad field without echoing secret values.

### 8. Backup, Restore, And Deletion Plan

Backup and restore are security features for availability and recovery.

Plan for:

- Encrypted R2 backups for D1 exports.
- Separate backup key material from runtime key material where practical.
- Restore tests before public multi-tenant use.
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

Each runbook should include:

- When to use it.
- Preconditions and required role.
- CLI dry-run command.
- Execution command.
- Verification command.
- Audit events expected.
- Rollback or recovery notes.

## Security Release Gates

Before public multi-tenant use, require:

- Threat model reviewed against this document.
- Cross-tenant authorization tests for all tenant-owned resources.
- Auth/session behavior reviewed against RFC 9700 and OWASP auth/session guidance.
- MFA and high-risk action challenge behavior tested for organization owners and administrators.
- Security checks mapped to OWASP ASVS Level 2 where applicable.
- API checks mapped to OWASP API Security Top 10.
- Key rotation plan and at least one successful restore drill.
- App connection revocation/reauthorization tested for every supported provider.
- Audit export verified for tenant boundaries, hash-chain integrity, and HMAC manifest validation.
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
