# CLI And Sync Plan

This document captures the target CLI shape and secret sync workflow for insecur. It is planning material. The current pre-v1 CLI only implements `login`, `pull`, and `run`.

## CLI Principles

The CLI should be the primary interface for developers, agents, and CI.

- Safe by default: never print secrets in status output, JSON output, logs, or errors.
- Delivery-first: prefer runtime injection to a child process or Secret Sync to a provider target over secret reveal to the caller.
- Source-of-truth first: insecur owns canonical secret versions; provider stores and child process environments receive derived deliveries.
- No plaintext persistence: CLI config, caches, operation records, and local metadata never store plaintext secret values.
- Secret-free logging: CLI debug output, errors, and JSON output never include plaintext secret values or child process environments.
- Safe input only: sensitive values enter through stdin, masked prompts, request bodies, or provider authorization flows, never URLs or CLI arguments.
- Scriptable by default: every command supports `--json`, and JSON output never contains secret values.
- Agent-friendly: stable exit codes, stable error codes, dry-runs, operation IDs, and resumable long-running operations.
- Developer-friendly: project defaults live in a committed non-secret config, while credentials live outside the repo.
- Tenant-aware: organization context is explicit or loaded from a checked local config.

## V1 Product Flow

The v1 flow should make secrets easier to use without increasing where agents can read them:

1. Store and rotate the secret in insecur as the Secret Source of Truth.
2. Sync derived copies to Cloudflare Worker secrets, Vercel environment variables, and GitHub Actions secrets when native provider storage is the right delivery boundary.
3. Use `insecur run <profile-id> -- <command>` for deploys and local commands that should receive secrets just in time without writing local secret files.
4. Keep human, agent, and JSON output metadata-only so command runners can use secrets without putting values into model context, logs, or terminal scrollback.

Production Secret Sync and Runtime Injection require the Storage Security Gate: root key material outside D1, organization and project data keys, key versions, provider credentials and Sensitive Metadata encrypted under tenant-bound data keys, and AES-GCM authenticated data binding ciphertext to organization, project, environment, secret, version, app connection, provider credential, and sensitive metadata identity. Delivery commands fail closed for production use until that gate passes.

## Local Configuration

### Project Config

`insecur init` writes `.insecur.json` in the project root. This file is safe to commit.

```json
{
  "host": "https://insecur.cloud",
  "orgId": "org_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
  "projectId": "prj_01JZ8E3A0K7J5T9Q2R4S6V8W0X",
  "defaultEnvId": "env_01JZ8E3W4C8M2H6N9P1Q3R5T7V",
  "profileId": "prof_01JZ8E4D7G2K8M5N0P3R6T9V1X",
  "gitBranchToEnvironment": {
    "main": "env_01JZ8E4R2P7M9N3K5T8V1X6Z0A",
    "staging": "env_01JZ8E5B6Q1N4M7T0V3X9Z2C8D"
  }
}
```

Rules:

- No tokens, provider credentials, secret values, key material, or refresh credentials.
- Store opaque IDs only in committed project config. Do not write Sensitive Display Names or plaintext selectors to `.insecur.json`.
- `--org-id`, `--project-id`, and `--env-id` flags override config.
- `gitBranchToEnvironment` overrides `defaultEnvId` unless `--env-id` is passed.
- Monorepos can pass `--config-dir <path>`.

### User Config

User config lives outside repositories, such as `~/.insecur/config.json`.

It may contain:

- Profiles.
- Host aliases.
- Human session metadata without credential material.
- Machine identity bootstrap credential references without credential material.
- Last selected organization/project/environment IDs.
- Stable IDs for organizations, projects, environments, app connections, and secret syncs.

It must not contain:

- Human session tokens, refresh tokens, deploy keys, OIDC tokens, bootstrap secrets, or machine access tokens.
- Project secret values.
- Provider app connection credentials.
- Root keys, organization data keys, project data keys, or DEKs.

Example profile shape:

```json
{
  "profiles": {
    "prof_01JZ8E6H2R7M4T0V9X3C5D8F1G": {
      "host": "https://insecur.cloud",
      "orgId": "org_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
      "projectId": "prj_01JZ8E3A0K7J5T9Q2R4S6V8W0X",
      "envId": "env_01JZ8E3W4C8M2H6N9P1Q3R5T7V",
      "defaultRunPolicyId": "rp_01JZ8E7K0N4P6T9V2X5Z8C1D3F"
    },
    "prof_01JZ8E8M5Q2R7V0X3Z6C9D1F4G": {
      "host": "https://insecur.cloud",
      "orgId": "org_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
      "projectId": "prj_01JZ8E3A0K7J5T9Q2R4S6V8W0X",
      "envId": "env_01JZ8E4R2P7M9N3K5T8V1X6Z0A",
      "defaultRunPolicyId": "rp_01JZ8E9P8S3V6X0Z2C5D8F1G4H"
    }
  }
}
```

Profile rules:

- CLI Profiles are selectors only; they do not contain secret values.
- A profile selects organization, project, environment, and default Runtime Policy Key by opaque ID.
- `insecur run <profile-id> -- <command>` is shorthand for selecting that profile before runtime injection.
- Flags still override profile defaults.

### Identification Model

V1 is configuration-driven and does not need general search over Sensitive Metadata.

- Use Scoped Lists for discovery, such as project secrets, environment policies, app connections, and sync targets.
- Use Configured Selectors for repeated commands. Configured Selectors are opaque IDs, not plaintext names or slugs.
- Decrypt Sensitive Display Names only after authorization for scoped list/detail output.
- Do not build plaintext search indexes over secret names, provider target names, policy binding names, or security-relevant relationships.
- Add blind indexes later only as a separate design if exact-match lookup becomes necessary.

Resolved ID cache rules:

- The CLI may cache server-issued IDs in user config or a local cache outside the repository.
- Cached IDs are hints only; authorization and tenant resolution still happen on the API.
- If an ID no longer resolves inside the authorized tenant boundary, the CLI must refresh scoped lists and report a stable warning or error code.

### Environment Variables

Non-secret environment variables:

- `INSECUR_HOST`
- `INSECUR_ORG`
- `INSECUR_PROJECT`
- `INSECUR_ENV`
- `INSECUR_PROFILE`
- `INSECUR_CLIENT_ID`
- `INSECUR_CONFIG_DIR`

Session-only credential environment variables:

- `INSECUR_SESSION_TOKEN`
- `INSECUR_DEPLOY_KEY`
- `INSECUR_OIDC_TOKEN`

Rules:

- Session-only credential variables are never written by insecur to disk.
- Human CLI login should require login for each shell session unless the user explicitly keeps a shell alive.
- Prefer `insecur shell <profile-id>` or one-shot `insecur run <profile-id> --login -- <command>` so the CLI can keep credentials in memory or in a child process environment without printing them.
- Do not accept sensitive values through CLI arguments. Use stdin, masked prompts, or provider authorization flows.

Precedence:

1. Explicit CLI flags.
2. Environment variables.
3. `.insecur.json`.
4. User profile defaults.

## Global Flags

All commands should support:

- `--host <url>`
- `--org-id <id>`
- `--project-id <id>` where project context applies
- `--env-id <id>` where environment context applies
- `--profile-id <id>`
- `--config-dir <path>`
- `--json`
- `--quiet`
- `--verbose`

Mutating or long-running commands should also support:

- `--dry-run`
- `--yes`
- `--idempotency-key <key>`
- `--operation <id>`

## Output Shape

Human output can be compact prose or tables. JSON output should be stable.

Success envelope:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "req_...",
    "operationId": "op_..."
  }
}
```

Error envelope:

```json
{
  "ok": false,
  "error": {
    "code": "auth.insufficient_scope",
    "message": "Missing required permission.",
    "retryable": false
  },
  "meta": {
    "requestId": "req_..."
  }
}
```

Secret delivery commands are the exception. `run` and sync operations may move secret values to approved destinations by design, but human and JSON output still contain metadata only. File delivery is local-development or legacy-tooling support, not a production path for Protected Environment secrets. Secret reveal to stdout or API response is not supported for Protected Environment secrets.

Secret values must never appear in CLI logs, debug output, JSON envelopes, operation records, cache files, profile files, or error messages. Runtime Injection may hold approved values in process memory only long enough to fork/exec the child process.

Secret values, provider credentials, deploy keys, bootstrap secrets, and OIDC tokens must never be accepted in URLs, query strings, route params, CLI arguments, or shell-visible value flags. Use request bodies over TLS, CLI stdin, masked prompts, or provider authorization flows.

## Exit Codes

- `0`: success
- `1`: unexpected failure
- `2`: invalid usage or validation error
- `3`: authentication required or expired
- `4`: authorization denied
- `5`: not found or intentionally indistinguishable forbidden/not found
- `6`: conflict or idempotency mismatch
- `7`: provider error
- `8`: rate limited or retryable upstream failure
- `9`: operation incomplete

## Command Shape

### Auth

```bash
insecur login
insecur login --browser
insecur login --device
insecur shell prof_01JZ8E6H2R7M4T0V9X3C5D8F1G
insecur run prof_01JZ8E6H2R7M4T0V9X3C5D8F1G --login -- npm run dev
insecur login --method oidc --provider github-actions
insecur login --method bootstrap --client-id "$INSECUR_CLIENT_ID" --client-secret-stdin
insecur logout
insecur whoami --json
```

Notes:

- Browser/device login is for humans.
- Human CLI auth is memory/session-only by default; no session token, refresh token, or access token is saved to disk.
- `insecur shell <profile-id>` launches a subshell with a short-lived session token in that child environment and clears it when the shell exits.
- OIDC is preferred for CI and agents running in supported platforms.
- Bootstrap credentials are a narrow fallback and should exchange for short-lived access tokens.
- Bootstrap secrets and OIDC tokens use safe sensitive input paths only, such as provider flow or stdin, never `--token <value>` or `--client-secret <value>`.

### Environment Deploy Keys

Deploy automation can use environment-scoped deploy keys for Runtime Injection when OIDC is unavailable.

Rules:

- A deploy key belongs to one Organization, one Project, and one Environment.
- A deploy key is attached to an explicit allowlist of Runtime Policy Key IDs.
- A deploy key cannot request arbitrary secrets, secret sets, command shapes, or Command Fingerprints.
- The attached Runtime Injection Policy owns the allowed secret set, command shape, Command Fingerprint requirement, TTL, and delivery behavior.
- A deploy key must not grant Secret Sync, cross-environment, cross-project, secret reveal, secret write, promotion, rollback, app connection management, or membership access.
- A deploy key exchanges for a short-lived access token and is audited on every exchange and denial.
- Deploy key expiration and rotation are controlled by a Deploy Key Rotation Policy.
- A Deploy Key Rotation Policy may set a hard expiration, rotation interval, reminder interval, or explicit non-expiring mode.
- Non-expiring deploy keys are allowed only when explicitly configured and must show as higher-risk in status, plan, and audit output.
- Creating, updating, disabling, or rotating a deploy key is audited.
- Deploy key values are accepted only through safe sensitive input paths and are never stored by the CLI.
- Secret Sync is server-side and uses the App Connection for provider authorization; it does not use deploy keys.

### Project Defaults

```bash
insecur init \
  --org-id org_01JZ8E2QYQ6M7F4K9A2B3C4D5E \
  --project-id prj_01JZ8E3A0K7J5T9Q2R4S6V8W0X \
  --env-id env_01JZ8E3W4C8M2H6N9P1Q3R5T7V
insecur config show --json
insecur config set default-env-id env_01JZ8E5B6Q1N4M7T0V3X9Z2C8D
insecur config set branch-env.main env_01JZ8E4R2P7M9N3K5T8V1X6Z0A
```

### Projects And Environments

```bash
insecur orgs list --json
insecur projects list --json
insecur projects create --project-id prj_01JZ8EDQ2R7V0X3Z6C9D1F4G5H --display-name-stdin
insecur envs list --json
insecur envs create --env-id env_01JZ8E4R2P7M9N3K5T8V1X6Z0A --display-name-stdin
insecur envs create --env-id env_01JZ8E3W4C8M2H6N9P1Q3R5T7V --display-name-stdin --copy-shapes-from-env-id env_01JZ8E4R2P7M9N3K5T8V1X6Z0A
```

Rules:

- Create commands use opaque IDs as durable selectors. Human-readable names are Sensitive Display Names and enter as request data, not selector keys.
- `--copy-shapes-from-env-id` copies Secret Shapes only.
- Protected Environment secret values are never copied into another Environment.
- Development values must be set as Environment Defaults or generated through explicit non-protected workflows.
- Environment inheritance is not supported.

### Shared Secret Sources

```bash
insecur shared-secrets create --shared-secret-id ss_01JZ8EAQ1N4M7T0V3X9Z2C8D5F --display-name-stdin --value-stdin
insecur shared-secrets attach ss_01JZ8EAQ1N4M7T0V3X9Z2C8D5F --env-id env_01JZ8E3W4C8M2H6N9P1Q3R5T7V
insecur shared-secrets attach ss_01JZ8EAQ1N4M7T0V3X9Z2C8D5F --env-id env_01JZ8E5B6Q1N4M7T0V3X9Z2C8D
insecur shared-secrets attachments ss_01JZ8EAQ1N4M7T0V3X9Z2C8D5F --json
```

Rules:

- A Shared Secret Source is an explicit source value, not a copy from another Environment.
- Attachments are explicit per Environment and are audited.
- Attaching a Shared Secret Source to a Protected Environment applies the Protected Environment egress policy to that source.
- Detaching a Shared Secret Source does not copy its current value into the Environment.
- Shared Secret Source selectors are opaque IDs. Display names are encrypted Sensitive Metadata.

### Secrets

```bash
insecur secrets list --json
insecur secrets set sec_01JZ8EBR4P7M9N3K5T8V1X6Z0A --value-stdin --comment "Rotate database URL"
insecur secrets promote sec_01JZ8EBR4P7M9N3K5T8V1X6Z0A --version 13 --comment "Promote rotated database URL"
insecur secrets rm sec_01JZ8EDZ9S4V7X0C3F6H9K2M5P --comment "Remove unused key"
insecur secrets versions sec_01JZ8EBR4P7M9N3K5T8V1X6Z0A --json
insecur secrets rollback sec_01JZ8EBR4P7M9N3K5T8V1X6Z0A --to-version 12 --promote --comment "Emergency rollback"
```

Rules:

- `set --value-stdin` avoids shell history leaks.
- `--value <secret>` is not supported.
- Secret selectors are opaque IDs. Secret names are Sensitive Display Names and never durable plaintext selectors.
- Mutations support `--comment`, `--json`, `--dry-run`, and `--idempotency-key`.
- Secret reveal is not supported for Protected Environment secrets.
- Setting a value in one Environment never copies that value to another Environment.
- In a Protected Environment, `set` creates a Draft Version that is not eligible for Runtime Injection or Secret Sync.
- Protected Environment delivery uses only the Published Version.
- `promote` makes a Draft Version the Published Version through an audited lifecycle event.
- `rollback` creates a new Secret Version from a retained encrypted prior Published Version; it never reveals the old plaintext value to the caller.
- Rollback eligibility is controlled by a configurable Rollback Retention Window.

### Runtime Injection

```bash
insecur run prof_01JZ8E6H2R7M4T0V9X3C5D8F1G -- npm run dev
insecur run prof_01JZ8E8M5Q2R7V0X3Z6C9D1F4G -- npm run deploy
insecur run --profile-id prof_01JZ8E6H2R7M4T0V9X3C5D8F1G -- npm test
insecur run --policy-id rp_01JZ8E7K0N4P6T9V2X5Z8C1D3F -- npm run dev
insecur run --policy-id rp_01JZ8E9P8S3V6X0Z2C5D8F1G4H -- npm run deploy
insecur run --watch -- npm run dev
```

Rules:

- `run <profile-id> -- <command>` selects a CLI Profile by opaque ID, resolves its environment and default runtime policy, then performs runtime injection.
- `--profile-id` is equivalent to the positional profile form when both identify the same profile ID.
- `run` injects secrets into the child process only.
- `--json` reports delivery metadata only and never embeds secret values.
- `--watch` is development-only and should restart the child process after changes.
- Runtime injection is the preferred deploy and local command path because the caller receives metadata, not plaintext values.
- Developers should use runtime injection instead of `.env` files whenever the command can read from environment variables.
- Agents should receive Secret Use through runtime injection, not Secret Reveal.
- Production runtime injection requires the Storage Security Gate.
- Protected Environment runtime injection uses Published Versions only; Draft Versions are never delivered.
- Protected Environment runtime injection requires a server-owned Runtime Injection Policy.
- `.insecur.json` may reference a policy by opaque Runtime Policy Key ID, but the server validates the policy, actor, environment, command, and Command Fingerprint before issuing an Injection Grant.
- Every Runtime Injection execution requires a fresh server-issued Injection Grant.
- An Injection Grant is short-lived, one-use, non-reusable, and scoped to one Runtime Injection Policy execution.
- The CLI may keep an authenticated session alive, but it must not reuse an Injection Grant across runs.
- Local policy files are advisory cache only and never authorize Protected Environment delivery.
- The v1 runtime wrapper can be the CLI process itself: fetch an Injection Grant, hold approved values in process memory, fork/exec the approved child with environment variables, and avoid writing values to stdout, JSON, logs, shell history, or disk.
- The CLI must never log the injected environment, even in verbose or debug mode.
- insecur must not capture or store stdout/stderr from runtime-injected child processes.
- Runtime Injection audit may record command metadata, Runtime Policy Key, Runtime Injection Policy Version, Command Fingerprint, delivered secret version IDs, start/end timestamps, duration, exit code, signal, and request ID, but not command output.
- A separate resident helper process is optional future hardening only if it creates a real boundary; it is not required for the v1 security model.
- Runtime injection crosses the Runtime Trust Boundary once the child process starts; the child can read its delivered environment.
- Dynamic runtime injection is preferred over provider Secret Sync for high-sensitivity Protected Environment secrets when the workflow can support it because it avoids storing a persistent copy in the provider.

### Runtime Injection Policies

```bash
insecur run-policies create \
  --policy-id rp_01JZ8E9P8S3V6X0Z2C5D8F1G4H \
  --env-id env_01JZ8E4R2P7M9N3K5T8V1X6Z0A \
  --command "npm run deploy" \
  --command-fingerprint sha256:... \
  --secret-ids sec_01JZ8EBR4P7M9N3K5T8V1X6Z0A,sec_01JZ8ECW6Q1N4M7T0V3X9Z2C8D \
  --require-mfa

insecur run-policies show rp_01JZ8E9P8S3V6X0Z2C5D8F1G4H --json
insecur run-policies disable rp_01JZ8E9P8S3V6X0Z2C5D8F1G4H --comment "Rotate deployment flow"
```

Rules:

- Runtime Injection Policies are stored server-side.
- Creating or changing a policy for a Protected Environment requires a human high-risk action challenge.
- Policies constrain actor, Project, Environment, command shape, Command Fingerprint, exact secret bindings, TTL, and delivery mode.
- Creating or changing a policy creates a new immutable Runtime Injection Policy Version and updates the active version pointer.
- Used Runtime Injection Policy Versions cannot be mutated because audit must reconstruct the exact authorization state that produced an Injection Grant.
- Runtime Injection Policy Versions are retained indefinitely as non-plaintext audit metadata. Encrypted secret value rollback retention remains separately configurable.
- Runtime Injection Policy Versions store immutable secret IDs and historical secret/display names for exact bindings. Historical names are Sensitive Metadata, not plaintext secrets.
- Runtime Injection Policy Version Sensitive Metadata is encrypted at rest. Only opaque IDs remain plaintext for lookup.
- Runtime Injection Policy secret selection is exact bindings only. Wildcards, prefixes, suffixes, regexes, tags, folders, and pattern queries are not supported.
- The Runtime Policy Key resolves to exactly one Runtime Injection Policy, and that policy's active version resolves to its exact secret set.
- Environment Deploy Keys may be attached to Runtime Policy Key IDs, but cannot override the policy's exact secret bindings or command constraints at exchange time.
- Every Injection Grant records the Runtime Injection Policy ID and Runtime Injection Policy Version ID/hash used to authorize it.
- Exact bindings are required for forensic traceability. Audit events must be able to show which policy key, Runtime Injection Policy Version, secret bindings, and delivered secret version IDs were involved without recording plaintext values.
- Protected Environment policies require a Command Fingerprint when practical.
- Command Fingerprints may hash selected scripts, package manifests, lockfiles, compiled artifacts, or an explicit command bundle.
- Command, script, dependency, or bundle changes should change the Command Fingerprint and require reapproval before protected delivery continues.
- Policies do not contain plaintext secret values.

### Controlled File Delivery

```bash
insecur pull --out .env
insecur pull --out secrets.json --format json
insecur export --out secrets.env --format dotenv-export
```

Rules:

- File delivery is denied for Protected Environment secrets.
- `pull` and `export` require an explicit `--out`.
- `--out` writes mode `0600` and refuses to overwrite by default.
- Inside a git repository, file delivery refuses tracked files and files not matched by ignore rules unless an explicit break-glass flag is provided.
- `--json` reports delivery metadata only and never embeds secret values.
- File delivery for dev uses that Environment's own values or Environment Defaults, never copied Protected Environment values.

### App Connections

```bash
insecur connections list --json
insecur connections create github --connection-id conn_01JZ8EFH2R7M4T0V9X3C5D8F1G --method github-app --display-name-stdin
insecur connections create vercel --connection-id conn_01JZ8EGK5Q2R7V0X3Z6C9D1F4H --method vercel-integration-oauth --display-name-stdin
insecur connections create cloudflare --connection-id conn_01JZ8EHM8S3V6X0Z2C5D8F1G4K --method scoped-api-token --display-name-stdin --allow-worker-id cfworker_01JZ8EJQ1N4M7T0V3X9Z2C8D5F
insecur connections status conn_01JZ8EFH2R7M4T0V9X3C5D8F1G --json
insecur connections rotate conn_01JZ8EFH2R7M4T0V9X3C5D8F1G --dry-run --json
insecur connections reauth conn_01JZ8EGK5Q2R7V0X3Z6C9D1F4H
insecur connections disconnect conn_01JZ8EHM8S3V6X0Z2C5D8F1G4K
```

Rules:

- `list`, `status`, and `show` never return provider credentials.
- `create` starts a provider authorization flow or records a scoped provider token through a safe input path.
- Provider tokens are accepted through stdin or masked prompt only; `--token <value>` is not supported.
- Production app connection credentials require the Storage Security Gate before they can be used for Secret Sync.
- Provider credentials are encrypted organization data with key version metadata and authenticated-data binding to the organization, app connection, provider, credential, and key version identity.
- App Connection selectors are opaque IDs. Display names and provider target names are encrypted Sensitive Metadata.
- Cloudflare `create` requires an explicit connection boundary, such as allowed account, Worker, and environment IDs.
- `rotate` and `reauth` create audited operations.

### Secret Syncs

```bash
insecur syncs list --json
insecur syncs create github-actions \
  --sync-id sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A \
  --connection-id conn_01JZ8EFH2R7M4T0V9X3C5D8F1G \
  --source-env-id env_01JZ8E4R2P7M9N3K5T8V1X6Z0A \
  --target-repo-id repo_01JZ8EMW6Q1N4M7T0V3X9Z2C8D \
  --target-github-environment-id ghenv_01JZ8ENZ9S4V7X0C3F6H9K2M5P

insecur syncs create vercel-env \
  --sync-id sync_01JZ8EPB2R7V0X3Z6C9D1F4G5H \
  --connection-id conn_01JZ8EGK5Q2R7V0X3Z6C9D1F4H \
  --source-env-id env_01JZ8E4R2P7M9N3K5T8V1X6Z0A \
  --target-project-id vercel_prj_123 \
  --target-env-id vercel_env_01JZ8EQR5Q2R7V0X3Z6C9D1F4H

insecur syncs create cloudflare-worker \
  --sync-id sync_01JZ8ERS8S3V6X0Z2C5D8F1G4K \
  --connection-id conn_01JZ8EHM8S3V6X0Z2C5D8F1G4K \
  --source-env-id env_01JZ8E4R2P7M9N3K5T8V1X6Z0A \
  --target-account-id cfacct_01JZ8ESV1N4M7T0V3X9Z2C8D5F \
  --target-worker-id cfworker_01JZ8EJQ1N4M7T0V3X9Z2C8D5F

insecur syncs plan sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A --json
insecur syncs run sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A --operation op_123
insecur syncs status sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A --json
insecur syncs disable sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A
insecur syncs delete sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A
```

Naming:

- The domain term is `Secret Sync`.
- The command group is `syncs` to avoid colliding with shell concepts and to make list/create/read/update/delete natural.

Security posture:

- Secret Sync is the native-platform and compatibility path.
- Secret Sync intentionally stores secret values in the destination provider's secret store until overwritten, rotated, or deleted.
- Production Secret Sync requires the Storage Security Gate.
- Protected Environment Secret Sync uses Published Versions only; Draft Versions are never synced.
- For high-sensitivity Protected Environment secrets, prefer Runtime Injection when the command can authenticate to insecur with OIDC or another short-lived auth method at execution time.
- Secret Sync remains appropriate when the provider must own delivery, when a workflow needs native provider secret semantics, or when insecur runtime availability must not block the provider workflow.

### Operations

```bash
insecur operations get op_123 --json
insecur operations wait op_123 --json
insecur operations cancel op_123
```

Long-running sync, rotation, backup, restore, and provider reauthorization workflows return an operation ID.

### Audit

```bash
insecur audit tail --json
insecur audit export --from 2026-05-01 --to 2026-05-23 --json
insecur audit verify ./audit-export.jsonl --manifest ./audit-export.manifest.json --json
```

Audit export rules:

- Exports are tenant-bounded.
- Entry files are JSONL.
- Each export includes a manifest with organization, time range, entry count, first hash, last hash, hash algorithm, HMAC key version, and HMAC.
- Full-fidelity exports may include Sensitive Metadata only for authorized security review.
- Low-privilege exports use immutable IDs and hashes and exclude historical secret/display names, provider target names, and policy binding names.
- `audit verify` checks the entry hash chain and HMACed manifest.
- HMAC verification proves integrity and authenticity to systems with the verification key; it is not public-key non-repudiation.

## Secret Sync Model

A `Secret Sync` maps a source in insecur to a target in a provider.

Core fields:

- `id`
- `org_id`
- `project_id`
- `display_name_ciphertext`
- `kind`: `github-actions`, `vercel-env`, or `cloudflare-worker`
- `connection_id`
- `source_env_id`
- exact source secret binding IDs
- `target_config_ciphertext`
- provider target opaque IDs needed for joins or provider API calls
- `mapping_behavior`: `managed` or `merge`
- `delete_behavior`: `leave` or `delete-managed`
- `auto_sync_enabled`
- `status`
- `last_planned_at`
- `last_synced_at`
- `last_operation_id`
- `created_by`
- `created_at`
- `updated_at`

Provider credentials live only on the app connection. A secret sync references the app connection and stores provider destination configuration, not provider tokens. Provider destination names are Sensitive Metadata; durable sync selectors are opaque IDs.

## Sync Lifecycle

### 1. Connect Provider

An organization admin creates an app connection.

- GitHub uses GitHub App installation where possible.
- Vercel uses Vercel Integration OAuth.
- Cloudflare uses a manually configured scoped API token unless a suitable Cloudflare app/OAuth install flow becomes available for Worker secret management.

The app connection stores encrypted provider credentials as organization data.

### 2. Create Secret Sync

A project admin creates a secret sync under a project.

The API validates:

- Actor can use the app connection.
- Actor can read source secrets.
- Actor can create syncs for the project.
- Target config shape is valid for the sync kind and stores opaque IDs as selectors.
- Protected Environment GitHub Actions syncs target an existing GitHub Environment; the API must not create the GitHub Environment as part of sync setup.
- Creating or enabling a Protected Environment GitHub Actions sync blocks unless the target GitHub Environment has visible protection rules.

### 3. Plan

Planning computes the intended provider changes without writing values.

Plan output includes:

- Target resource identity.
- Target existence and provider-side protection summary where the provider exposes it.
- Secret IDs and, for authorized full-fidelity output only, decrypted Sensitive Display Names to create, update, leave, or delete.
- Provider capability warnings.
- Blocking safety failures, including missing GitHub Environment Protection for Protected Environment sync.
- Missing permissions.
- Whether reauthorization is required.

Plan output must not include secret values.

### 4. Run

Running the sync creates an operation, enqueues work, and returns the operation ID. Provider writes happen in queue consumers, not in the initial request.

The queued worker:

- Loads current source secret versions for non-protected sources.
- Revalidates actor, sync, source Environment, app connection, and provider target constraints before decrypting values.
- For Protected Environment sources, loads only Published Versions and blocks if any selected secret has no Published Version.
- Revalidates that a Protected Environment GitHub Actions sync still targets an existing GitHub Environment before writing values.
- Blocks before decrypting values if the target GitHub Environment no longer has visible protection rules.
- Decrypts values only inside request/job execution.
- Writes provider secrets using the app connection.
- Records managed provider keys where the provider supports metadata or where insecur can track them internally.
- Writes audit events for start, per-target result summary, and completion.
- Stores provider errors in normalized form.
- Updates operation status in D1 after every meaningful state transition.
- Retries retryable provider failures with delay metadata.
- Sends exhausted failures to a dead-letter path for operator review.

### 5. Verify

Verification confirms provider state without exposing values.

Where providers do not allow reading secret values back, verification checks metadata, update timestamps, key presence, and provider response status.

### 6. Retry Or Reauth

Retryable provider failures return retry metadata. Credential failures return `provider.reauth_required`.

Agents should be able to:

- Poll operation status.
- Retry with the same operation ID or idempotency key.
- Stop and report when human provider reauthorization is required.

## Sync Execution Runtime

Sync execution is queue-backed:

1. `syncs run` validates authorization and idempotency.
2. The API writes an operation record in D1.
3. The API enqueues a sync job.
4. The API returns an operation ID.
5. A queue consumer performs provider writes and records progress.
6. A Durable Object serializes provider writes for the same organization/provider/target.
7. `operations get` and `operations wait` report machine-readable state.

Runtime rules:

- D1 is the operation and audit source of truth.
- Queue messages contain operation IDs and target identifiers, not plaintext secret values.
- Plaintext secrets are decrypted only inside the active queue consumer execution.
- Queue consumers must not log decrypted values, raw provider request bodies, or raw provider response bodies.
- Retryable provider failures use delayed retries.
- Exhausted failures go to a dead-letter path.
- Concurrent runs for the same provider destination are serialized through a Durable Object execution gate.
- The Durable Object is coordination only; D1 remains the operation and audit source of truth.
- Operation audit events include enqueue, lock acquisition, provider write summaries, retry, dead-letter, completion, cancellation, and lock release.

## Sync Behavior

### Mapping Behavior

`managed`:

- insecur owns the target keys it writes.
- Deletes can remove keys previously managed by the sync if `delete_behavior` permits.

`merge`:

- insecur writes only selected keys.
- Other provider keys are left alone.
- Deletes default to `leave`.

### Delete Behavior

`leave`:

- Removing a source secret does not delete provider secrets.
- Plan reports stale managed keys.

`delete-managed`:

- Removing a source secret deletes provider keys that this sync previously managed.
- Requires explicit opt-in.

### Conflict Behavior

If the provider target changed since the last sync:

- Plan reports a conflict.
- Run refuses by default.
- `--force` may be allowed for explicit operator action.

## Provider Targets

### GitHub Actions

Kind: `github-actions`

Target config:

- Owner/repo.
- GitHub Environment ID where provider APIs expose it; any required provider environment name is Sensitive Metadata.
- Provider scope: `environment` or `repository`.

Notes:

- Prefer GitHub App installation tokens.
- GitHub Actions syncs are project-specific in insecur and normally target one repository for that project.
- Protected Environment syncs to GitHub Actions target GitHub Environment secrets by default.
- Protected Environment syncs must target a GitHub Environment that already exists in the selected repository.
- insecur must not auto-create GitHub Environments for Protected Environment syncs because doing so could bypass expected provider-side approval or deployment protection rules.
- Protected Environment syncs block unless the target GitHub Environment has visible protection rules.
- The exact minimum GitHub Environment Protection criteria are deferred; do not block broader v1 security planning on that provider-specific rule matrix.
- GitHub repository secrets are still repo-specific, but they are available more broadly within that repository.
- Use GitHub repository secrets only when the project workflow genuinely needs repository-wide secret availability or does not use GitHub Environments.
- Repository-scoped GitHub Actions sync from a Protected Environment requires an explicit high-risk override and audit reason.
- GitHub secrets are write-only after creation; verification cannot compare plaintext.
- Use repository/environment public key APIs for encrypted secret upload.
- Dynamic Runtime Injection through GitHub Actions OIDC can avoid storing the secret value in GitHub at all. In that mode, the workflow authenticates to insecur at run time, receives only an Injection Grant for the approved command, and delivers values directly into that command's environment.
- Runtime Injection still crosses the Runtime Trust Boundary after the child command starts. A malicious workflow step or approved command can read or leak values it was intentionally given.

### Vercel Environment Variables

Kind: `vercel-env`

Target config:

- Vercel team ID.
- Vercel project ID.
- Vercel target environment ID where available; any required provider environment name is Sensitive Metadata.

Notes:

- Use Vercel Integration OAuth instead of a manually pasted Vercel API token.
- Track provider variable IDs when available.
- Support environment-specific syncs.

### Cloudflare Worker Secrets

Kind: `cloudflare-worker`

Target config:

- Account ID.
- Worker script/service ID where available; any required provider worker name is Sensitive Metadata.
- Environment ID where available; any required provider environment name is Sensitive Metadata.

Notes:

- Start with scoped Cloudflare API tokens for hosted sync.
- Use the minimum permissions needed to list and update the selected Worker secrets.
- Require a connection boundary and show it in `connections status`.
- Require each secret sync to pin explicit target Workers and environments inside the connection boundary.
- Support per-Worker Cloudflare app connections for sensitive projects.
- If Cloudflare exposes a suitable OAuth/provider app flow for Worker secret management later, add it as a new connection method.
- Never accept global API keys.

## API Shape

Target API routes:

```text
GET    /v1/orgs/:org/connections
POST   /v1/orgs/:org/connections
GET    /v1/orgs/:org/connections/:connection
POST   /v1/orgs/:org/connections/:connection/reauth
POST   /v1/orgs/:org/connections/:connection/rotate
POST   /v1/orgs/:org/connections/:connection/disconnect

GET    /v1/orgs/:org/projects/:project/syncs
POST   /v1/orgs/:org/projects/:project/syncs
GET    /v1/orgs/:org/projects/:project/syncs/:sync
PATCH  /v1/orgs/:org/projects/:project/syncs/:sync
POST   /v1/orgs/:org/projects/:project/syncs/:sync/plan
POST   /v1/orgs/:org/projects/:project/syncs/:sync/run
POST   /v1/orgs/:org/projects/:project/syncs/:sync/disable
DELETE /v1/orgs/:org/projects/:project/syncs/:sync

GET    /v1/orgs/:org/operations/:operation
POST   /v1/orgs/:org/operations/:operation/cancel
```

All routes are organization-qualified. Sync routes also resolve the project under the organization.

## Tests To Plan

CLI:

- Config precedence.
- `.insecur.json` contains no secrets.
- `pull --out` writes values to an approved file with mode `0600`.
- Protected Environment file delivery is denied unless an explicit non-production policy allows it.
- `run` injects values into the child process without printing them.
- Secret values never appear in JSON output.
- `--json` output is stable.
- Error code to exit code mapping.
- Idempotent retry behavior.

Sync:

- Cross-tenant connection use is denied.
- Cross-project sync access is denied.
- Plan does not expose secret values.
- Run uses only current secret versions.
- Delete behavior respects `leave` vs `delete-managed`.
- Provider credential errors return `provider.reauth_required`.
- Retryable provider errors include retry metadata.
- Audit events are written for plan/run/verify/failure.
