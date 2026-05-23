# CLI And Sync Plan

This document captures the target CLI shape and secret sync workflow for insecur. It is planning material. The current CLI only implements `login`, `pull`, and `run`.

## CLI Principles

The CLI should be the primary interface for developers, agents, and CI.

- Safe by default: never print secrets in status output, logs, or errors.
- Scriptable by default: every command that is not literally returning secret values supports `--json`.
- Agent-friendly: stable exit codes, stable error codes, dry-runs, operation IDs, and resumable long-running operations.
- Developer-friendly: project defaults live in a committed non-secret config, while credentials live outside the repo.
- Tenant-aware: organization context is explicit or loaded from a checked local config.

## Local Configuration

### Project Config

`insecur init` writes `.insecur.json` in the project root. This file is safe to commit.

```json
{
  "host": "https://insecur.cloud",
  "org": "acme",
  "project": "api",
  "defaultEnv": "dev",
  "profile": "acme-dev",
  "gitBranchToEnvironment": {
    "main": "prod",
    "staging": "staging"
  }
}
```

Rules:

- No tokens, provider credentials, secret values, key material, or refresh credentials.
- `--org`, `--project`, and `--env` flags override config.
- `gitBranchToEnvironment` overrides `defaultEnv` unless `--env` is passed.
- Monorepos can pass `--config-dir <path>`.

### User Config

User config lives outside repositories, such as `~/.insecur/config.json`.

It may contain:

- Profiles.
- Host aliases.
- Human session metadata.
- Machine identity bootstrap credential references.
- Last selected organization/project/env.

It must not contain:

- Project secret values.
- Provider app connection credentials.
- Root keys, organization data keys, project data keys, or DEKs.

### Environment Variables

Supported environment variables:

- `INSECUR_HOST`
- `INSECUR_ORG`
- `INSECUR_PROJECT`
- `INSECUR_ENV`
- `INSECUR_PROFILE`
- `INSECUR_TOKEN`
- `INSECUR_CLIENT_ID`
- `INSECUR_CLIENT_SECRET`
- `INSECUR_OIDC_TOKEN`
- `INSECUR_CONFIG_DIR`

Precedence:

1. Explicit CLI flags.
2. Environment variables.
3. `.insecur.json`.
4. User profile defaults.

## Global Flags

All commands should support:

- `--host <url>`
- `--org <slug>`
- `--project <slug>` where project context applies
- `--env <slug>` where environment context applies
- `--profile <name>`
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

Secret-value commands are the exception. `pull`, `export`, and `run` may place secret values in stdout or child process environment by design. Status/progress messages go to stderr.

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
insecur login --method oidc --oidc-token "$ACTIONS_ID_TOKEN"
insecur login --method bootstrap --client-id "$INSECUR_CLIENT_ID" --client-secret "$INSECUR_CLIENT_SECRET"
insecur logout
insecur whoami --json
```

Notes:

- Browser/device login is for humans.
- OIDC is preferred for CI and agents running in supported platforms.
- Bootstrap credentials are a narrow fallback and should exchange for short-lived access tokens.

### Project Defaults

```bash
insecur init --org acme --project api --env dev
insecur config show --json
insecur config set default-env staging
insecur config set branch-env.main prod
```

### Projects And Environments

```bash
insecur orgs list --json
insecur projects list --json
insecur projects create api --name "API"
insecur envs list --json
insecur envs create prod --name "Production"
```

### Secrets

```bash
insecur secrets list --json
insecur secrets get DATABASE_URL
insecur secrets set DATABASE_URL --value-stdin --comment "Rotate database URL"
insecur secrets rm OLD_KEY --comment "Remove unused key"
insecur secrets versions DATABASE_URL --json
insecur secrets rollback DATABASE_URL --to-version 12 --comment "Rollback failed rotation"
```

Rules:

- `get` prints only the secret value by default.
- `set --value-stdin` avoids shell history leaks.
- Mutations support `--comment`, `--json`, `--dry-run`, and `--idempotency-key`.

### Pull, Export, And Run

```bash
insecur pull
insecur pull --env prod --format dotenv
insecur pull --format json
insecur pull --out .env
insecur export --format dotenv-export
insecur run -- npm run dev
insecur run --watch -- npm run dev
```

Rules:

- `pull` defaults to dotenv on stdout.
- `--out` writes mode `0600`.
- `run` injects secrets into the child process only.
- `--watch` is development-only and should restart the child process after changes.

### App Connections

```bash
insecur connections list --json
insecur connections create github --method github-app --name github-main
insecur connections create vercel --method oauth --name vercel-main
insecur connections create cloudflare --method scoped-api-token --name cf-main
insecur connections status github-main --json
insecur connections rotate github-main --dry-run --json
insecur connections reauth vercel-main
insecur connections disconnect cf-main
```

Rules:

- `list`, `status`, and `show` never return provider credentials.
- `create` starts a provider authorization flow or records a scoped credential through a safe input path.
- `rotate` and `reauth` create audited operations.

### Secret Syncs

```bash
insecur syncs list --json
insecur syncs create github-actions \
  --name repo-prod \
  --connection github-main \
  --source-env prod \
  --target-repo zaks-io/api \
  --target-env production

insecur syncs create vercel-env \
  --name web-prod \
  --connection vercel-main \
  --source-env prod \
  --target-project prj_123 \
  --target-env production

insecur syncs create cloudflare-worker \
  --name worker-prod \
  --connection cf-main \
  --source-env prod \
  --target-account abc \
  --target-worker api-worker

insecur syncs plan repo-prod --json
insecur syncs run repo-prod --operation op_123
insecur syncs status repo-prod --json
insecur syncs disable repo-prod
insecur syncs delete repo-prod
```

Naming:

- The domain term is `Secret Sync`.
- The command group is `syncs` to avoid colliding with shell concepts and to make list/create/read/update/delete natural.

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
```

## Secret Sync Model

A `Secret Sync` maps a source in insecur to a target in a provider.

Core fields:

- `id`
- `org_id`
- `project_id`
- `name`
- `kind`: `github-actions`, `vercel-env`, or `cloudflare-worker`
- `connection_id`
- `source_env`
- `source_path`
- `secret_filter`
- `target_config_json`
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

Provider credentials live only on the app connection. A secret sync references the app connection and stores provider destination configuration, not provider tokens.

## Sync Lifecycle

### 1. Connect Provider

An organization admin creates an app connection.

- GitHub uses GitHub App installation where possible.
- Vercel uses Vercel integration OAuth.
- Cloudflare uses OAuth/provider app where supported, otherwise scoped API token.

The app connection stores encrypted provider credentials as organization data.

### 2. Create Secret Sync

A project admin creates a secret sync under a project.

The API validates:

- Actor can use the app connection.
- Actor can read source secrets.
- Actor can create syncs for the project.
- Target config shape is valid for the sync kind.

### 3. Plan

Planning computes the intended provider changes without writing values.

Plan output includes:

- Target resource identity.
- Secret names to create, update, leave, or delete.
- Provider capability warnings.
- Missing permissions.
- Whether reauthorization is required.

Plan output must not include secret values.

### 4. Run

Running the sync:

- Loads current source secret versions.
- Decrypts values only inside request/job execution.
- Writes provider secrets using the app connection.
- Records managed provider keys where the provider supports metadata or where insecur can track them internally.
- Writes audit events for start, per-target result summary, and completion.
- Stores provider errors in normalized form.

### 5. Verify

Verification confirms provider state without exposing values.

Where providers do not allow reading secret values back, verification checks metadata, update timestamps, key presence, and provider response status.

### 6. Retry Or Reauth

Retryable provider failures return retry metadata. Credential failures return `provider.reauth_required`.

Agents should be able to:

- Poll operation status.
- Retry with the same operation ID or idempotency key.
- Stop and report when human provider reauthorization is required.

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

- Owner/repo or organization.
- Environment name, optional.
- Visibility/scope where GitHub supports it.

Notes:

- Prefer GitHub App installation tokens.
- GitHub secrets are write-only after creation; verification cannot compare plaintext.
- Use repository/environment public key APIs for encrypted secret upload.

### Vercel Environment Variables

Kind: `vercel-env`

Target config:

- Vercel team ID.
- Vercel project ID.
- Vercel target environment such as production, preview, or development.

Notes:

- Prefer Vercel integration OAuth.
- Track provider variable IDs when available.
- Support environment-specific syncs.

### Cloudflare Worker Secrets

Kind: `cloudflare-worker`

Target config:

- Account ID.
- Worker script/service name.
- Environment name, optional.

Notes:

- Prefer OAuth/provider app flows where supported.
- If Worker secret APIs require API tokens, use scoped account/worker tokens only.
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
- `pull` keeps values on stdout and status on stderr.
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
