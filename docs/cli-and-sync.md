# CLI And Sync Plan

This document captures the target CLI shape and secret sync workflow for insecur. It is planning material. Existing unsafe CLI behavior is disposable and does not create a pre-v1 compatibility contract.

## CLI Principles

The CLI should be the primary interface for developers, agents, and CI.

- Safe by default: never print Sensitive Values in status output, JSON output, logs, or errors.
- Delivery-first: prefer runtime injection to a child process or Secret Sync to a provider target over Secret Reveal to the caller.
- Source-of-truth first: insecur owns canonical secret versions; provider stores and child process environments receive derived deliveries.
- No plaintext persistence: CLI config, caches, operation records, and local metadata never store Sensitive Values.
- Secret-free logging: CLI debug output, errors, and JSON output never include Sensitive Values or child process environments.
- Safe input only: Sensitive Values enter through stdin, masked prompts, request bodies, or provider authorization flows, never URLs or CLI arguments.
- Misuse-resistant defaults: ordinary management commands should not have accidental reveal, readback, or export shapes.
- Scriptable by default: every command supports `--json`, and JSON output never contains Sensitive Values.
- Agent-friendly: stable exit codes, stable error codes, dry-runs, operation IDs, and resumable long-running operations.
- Developer-friendly: project defaults live in a committed non-secret config, while credentials live outside the repo.
- Tenant-aware: organization context is explicit or loaded from a checked local config.

## V1 Product Flow

The v1 flow should make secrets easier to use without increasing where agents can read them:

Flagship promise: agents and CI can use production secrets for approved deploy and runtime workflows without giving local agents or ordinary human sessions a read path to Protected Environment Sensitive Values.

1. Store and rotate the secret in insecur as the Secret Source of Truth.
2. Sync derived copies to direct Cloudflare Worker secrets, Vercel environment variables, and GitHub Actions secrets when native provider storage is the right delivery boundary.
3. Use `insecur run <profile-id> -- <command>` for deploys and local commands that should receive secrets just in time without writing local secret files.
4. Keep human, agent, and JSON output metadata-only so command runners can use secrets without putting values into model context, logs, or terminal scrollback.

Production Secret Delivery and Secret Sync require the [Storage Security Gate](storage-security-gate.md): a metadata-only readiness verdict over root key placement, tenant data keys, key versions, Tenant-Scoped Store/RLS, encrypted Provider Credentials and Sensitive Metadata, ciphertext identity binding, and no-plaintext persistence. Delivery commands fail closed for production use until that gate passes.

## Guided First Run

Hosted first run should start after Guided Organization Provisioning has already created a Personal Organization, owner Membership, first Project, and non-protected development Environment for the admitted User. The CLI should be able to select those defaults and write only opaque IDs to `.insecur.json`; the user should not have to name an Organization, Project, or Environment before seeing product value.

The first development Environment is non-protected and intended for safe first use. It can receive a Blind Secret Write that becomes current immediately and can be used through local Runtime Injection without revealing the Sensitive Value in shell history, local files, CLI JSON, or agent transcript. Provider App Connections, Secret Sync setup, Protected Environments, and production deploy workflows are follow-on setup after the user has a working secret path.

The beachhead workflow is a First Value Proof: generate a development secret server-side with the normal `secrets set` command, consume it with the normal `run` command, and return only success or failure. The proof should not require Cloudflare, Vercel, GitHub, provider tokens, repository selection, Worker script names, production environment setup, or a dedicated onboarding-only CLI command.

Preferred command sequence:

```bash
insecur secrets set --secret-name INSECUR_PROOF_SECRET --generate random --length 32 --comment "First value proof"
insecur run --secret-name INSECUR_PROOF_SECRET -- node examples/first-value-proof/verify.mjs
```

The sequence uses normal product primitives:

1. Resolve the Personal Organization, first Project, first non-protected development Environment, and default local Runtime Injection profile.
2. Create or update the Secret Shape for the requested binding through the normal `secrets set --secret-name` path.
3. Perform a service-generated Blind Secret Write whose output is metadata only.
4. Run the copyable verifier in `examples/first-value-proof/verify.mjs` through Runtime Injection with one exact non-protected secret selected by `run --secret-name`.
5. Print metadata-only success or failure, including opaque IDs and operation IDs, but never the Sensitive Value, child-process environment, or raw digest.

The verifier is intentionally ordinary application code:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

const value = process.env.INSECUR_PROOF_SECRET;
const challenge = "insecur:first-value-proof:v1";
const mac = createHmac("sha256", value).update(challenge).digest();
const expected = createHmac("sha256", value).update(challenge).digest();

console.log(timingSafeEqual(mac, expected) ? "secret proof: ok" : "secret proof: failed");
```

This gives the user a working example they can run immediately and then adapt into their own application code. It proves that the caller can create and use a generated non-protected development secret without seeing it in command output or local files. It does not prove that an arbitrary child process cannot read an injected development value after Runtime Injection crosses the Runtime Trust Boundary.

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

- No Sensitive Values.
- Store opaque IDs as durable selectors in committed project config. Display Names are normal labels, not selectors.
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

- Sensitive Values, including human session tokens, refresh tokens, deploy keys, OIDC tokens, bootstrap secrets, machine access tokens, project secret values, provider app connection credentials, root keys, organization data keys, project data keys, or DEKs.

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

- CLI Profiles are selectors only; they do not contain Sensitive Values.
- A profile selects organization, project, environment, and default Runtime Policy Key by opaque ID.
- `insecur run <profile-id> -- <command>` is shorthand for selecting that profile before runtime injection.
- Flags still override profile defaults.

### Identification Model

V1 is configuration-driven and does not need general search over Sensitive Metadata.

- Use Scoped Lists for discovery, such as project secrets, environment policies, app connections, and sync targets.
- Use Configured Selectors for repeated commands. Configured Selectors are opaque IDs, not plaintext names or slugs.
- Display Names are ordinary metadata shown after authorization and may be used for scoped list filtering.
- Do not build plaintext search indexes over Sensitive Metadata such as Approval Context Notes, Push Device Registrations, provider target names, provider-side secret or variable names used by Explicit Provider Lookup or Secret Sync Bindings, policy binding names, or security-relevant relationships.
- Add blind indexes later only as a separate design if exact-match lookup becomes necessary.

ID generation rules:

- Opaque resource IDs are client-minted on create. Most create commands accept explicit flags such as `--project-id`, `--env-id`, `--secret-id`, `--connection-id`, `--sync-id`, and `--policy-id`; narrow developer-first shortcuts may client-mint the opaque ID internally when the parent scope is fully resolved, returning the generated ID in metadata-only output.
- The server validates ID format and enforces tenant-scoped uniqueness, returning a conflict (exit code `6`) when a client-minted ID already exists in that tenant.
- A client-minted ID is the natural creation idempotency key, so a retried create with the same ID resolves to the same resource or a clean conflict without a separate `--idempotency-key`.
- Opaque resource IDs are non-secret selectors, not capability tokens; authorization is enforced server-side and a guessed cross-tenant ID still fails authorization.
- `--idempotency-key` is for non-create actions such as promote, run, and rotate that have no client-minted resource ID.

Resolved ID cache rules:

- The CLI may cache resolved IDs, ones it created or saw in a Scoped List, in user config or a local cache outside the repository.
- Cached IDs are hints only; authorization and tenant resolution still happen on the API.
- If an ID no longer resolves inside the authorized tenant boundary, the CLI must refresh scoped lists and report a stable warning or error code.

Display Name Resolution rules:

- Targeting commands accept an explicit Display Name flag such as `--project-name`, `--env-name`, `--secret-name`, `--connection-name`, `--sync-name`, or `--profile-name`, separate from the opaque `--*-id` flag. A name flag is never overloaded onto an ID flag.
- The CLI performs Display Name Resolution client-side: it resolves the Display Name to exactly one opaque resource ID through a Scoped List in the already-resolved parent scope, then acts on that ID. The server contract stays opaque-ID-only; a Display Name is never sent as a durable selector.
- Resolution is exact-match and case-sensitive. Zero matches return not found (exit code `5`) unless a command explicitly documents create-on-missing behavior in a fully resolved parent scope. Two or more matches return a validation error (exit code `2`) that lists candidate opaque IDs and Display Names and never auto-selects. Substring or fuzzy matching is for interactive `list` filtering only, never for resolution before an action.
- A Display Name resolves within exactly one fully-resolved parent scope from the precedence chain of CLI flags, environment variables, `.insecur.json`, and user profile defaults. If the parent scope is not pinned to one Organization, Project, or Environment, the command fails before resolving the child rather than searching across scopes. Multi-level resolution resolves each level in order, such as `--env-name` before `--secret-name`. There is no cross-Project Display Name Resolution.
- Read commands and non-destructive mutations accept Display Name Resolution for any caller.
- Protected but recoverable actions such as `promote`, `publish`, and `rollback` accept Display Name Resolution for any caller, because the High-Assurance Challenge, Approval Impact Review, or Destructive Confirmation shows the resolved opaque ID and Display Name before anything changes.
- Irreversible or destructive actions such as Draft Version Discard, Secret Sync Deletion, and connection disconnect require the opaque `--*-id` for non-interactive and Machine Identity callers and do not accept a Display Name. Interactive human callers may resolve by name but receive a Destructive Confirmation echoing the resolved opaque ID. This extends the existing rule that API and Machine Identity Draft Version Discard require exact IDs.
- The audit record and any local cache always store the resolved opaque ID, never the Display Name.
- The CLI never caches a Display Name to opaque ID mapping. Every name flag re-resolves live against a current Scoped List, so a rename cannot silently retarget a later command through a stale cache. Only opaque IDs are cached.
- Agents should resolve a Display Name once, then reuse the opaque ID for later commands, since Display Names are mutable and a later resolution may select a different resource.

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
- Do not accept Sensitive Values through CLI arguments. Use stdin, masked prompts, or provider authorization flows.

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

`--yes` answers ordinary prompts only. It must not satisfy scoped high-risk confirmations such as destructive managed-copy deletion or unknown provider overwrite confirmation.

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

Secret delivery commands are the exception. `run` and sync operations may move Secret values to approved destinations by design, but human and JSON output still contain metadata only. File delivery is local-development or legacy-tooling support, not a production path for Protected Environment secrets. Secret Reveal to stdout or API response is not supported for Protected Environment secrets.

Sensitive Values must never appear in CLI logs, debug output, JSON envelopes, operation records, cache files, profile files, or error messages. Runtime Injection may hold approved values in process memory only long enough to fork/exec the child process.

Sensitive Values must never be accepted in URLs, query strings, route params, CLI arguments, or shell-visible value flags. Use request bodies over TLS, CLI stdin, masked prompts, or provider authorization flows.

CLI command design should make safe management paths short and predictable while making exposure paths impossible or explicit. Protected Environment reveal, provider readback, and accidental export command shapes are not allowed.

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
- `10`: human step-up required (a High-Assurance Challenge the acting credential cannot satisfy)

## Agent Execution And Human Step-Up

A local coding agent has no identity of its own. It runs inside a human-initiated session, started with `insecur shell <profile-id>` or `insecur run <profile-id> --login -- <command>`, inherits the short-lived `INSECUR_SESSION_TOKEN` from the process environment, and acts with the human's Effective Access. Because a High-Assurance Challenge re-verifies the human freshly, the agent can do low-risk work autonomously but cannot clear high-risk gates on its own.

- Any action requiring a High-Assurance Challenge that the acting credential cannot satisfy fails closed with exit code `10` and stable error code `auth.high_assurance_required`.
- The `auth.high_assurance_required` error envelope carries a bounded operation ID in `meta.operationId` describing the exact pending action the human must authorize.
- The human clears the High-Assurance Challenge out-of-band in the authenticated web app Human Approval Surface against that bounded operation ID. The challenge authorizes only that operation and creates no reusable authority for future actions.
- The agent resumes by polling `insecur operations wait <operation-id>` and continuing against the same bounded operation ID once the human has cleared the challenge.
- A Machine Identity or deploy key credential receives the same `10` / `auth.high_assurance_required` result for high-risk gates and cannot self-clear; it must surface the step-up to a human.
- Delivery Risk Policy Presets may allow configured non-protected development or preview delivery from agent-reachable CLI/API channels. V1 exposes Strict, Balanced, and Automation-Friendly presets instead of a custom policy editor; the server still stores versioned, scoped, auditable Delivery Risk Policy behind the preset. Balanced allows development automation by default, while preview automation requires Preview Automation Opt-In on the specific non-protected preview Environment. Preview Automation Opt-In grants execution-only authority for existing Runtime Injection Policies, existing Secret Syncs, and existing Secret Sync Bindings; it does not allow CLI/API callers to create or change App Connections, Connection Boundaries, Secret Syncs, Secret Sync Bindings, Runtime Injection Policies, provider targets, or the delivered Secret set. Protected Environment approval, protected Secret Sync enable/run, protected Runtime Injection Policy changes, and production Cloudflare Worker Secret Deploy approval evidence cannot be completed terminal-only in V1.
- Risk-broadening Delivery Changes, including loosening presets, enabling Preview Automation Opt-In, adding preview Secret Sync Bindings, changing preview Runtime Injection Policies, or expanding the delivered preview Secret set, return the same `10` / `auth.high_assurance_required` path from CLI/API. Risk-tightening changes are authenticated web app settings actions and are not completed terminal-only in V1.

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
- Bootstrap secrets and OIDC tokens are Sensitive Values and use safe sensitive input paths only, such as provider flow or stdin, never `--token <value>` or `--client-secret <value>`.

### Environment Deploy Keys

Deploy automation can use environment-scoped deploy keys for Runtime Injection when OIDC is unavailable.

Rules:

- A deploy key belongs to one Organization, one Project, and one Environment.
- A deploy key is attached to an explicit allowlist of Runtime Policy Key IDs.
- A deploy key cannot request arbitrary secrets, secret sets, command shapes, or Command Fingerprints.
- The attached Runtime Injection Policy owns the allowed secret set, command shape, Command Fingerprint requirement, TTL, and delivery behavior.
- A deploy key must not grant Secret Sync, cross-environment, cross-project, Secret Reveal, secret write, promotion, rollback, app connection management, or membership access.
- A deploy key cannot satisfy a High-Assurance Challenge or create/change protected configuration.
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

- Create commands use opaque IDs as durable selectors. Human-readable names are Display Names and enter as request data, not selector keys.
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
- Attaching a Shared Secret Source to a Protected Environment requires a High-Assurance Challenge.
- Detaching a Shared Secret Source does not copy its current value into the Environment.
- Shared Secret Source selectors are opaque IDs. Display names are encrypted Sensitive Metadata.

### Secrets

```bash
insecur secrets list --json
insecur secrets set sec_01JZ8EBR4P7M9N3K5T8V1X6Z0A --value-stdin --comment "Rotate database URL"
insecur secrets set sec_01JZ8EBR4P7M9N3K5T8V1X6Z0A --generate random --length 32 --comment "Generate admin key"
insecur secrets promote --draft-version-id sv_01JZ8EVR4P7M9N3K5T8V1X6Z0A --comment "Promote rotated database URL"
insecur secrets promote \
  --draft-version-id sv_01JZ8EVR4P7M9N3K5T8V1X6Z0A \
  --draft-version-id sv_01JZ8EWS6Q1N4M7T0V3X9Z2C8D \
  --comment "Promote staged production config"
insecur secrets rm sec_01JZ8EDZ9S4V7X0C3F6H9K2M5P --comment "Remove unused key"
insecur secrets versions sec_01JZ8EBR4P7M9N3K5T8V1X6Z0A --json
insecur secrets rollback sec_01JZ8EBR4P7M9N3K5T8V1X6Z0A --to-version 12 --promote --comment "Emergency rollback"
insecur approvals list --env-id env_01JZ8E4R2P7M9N3K5T8V1X6Z0A --json
insecur approvals approve appr_01JZ8EKEY7G2K8M5N0P3R6T9V1 --comment "Approve generated admin key"
```

Rules:

- Secret writes are Blind Secret Writes: output includes metadata only and never returns the Sensitive Value.
- Blind Secret Write creates a normal Secret Version; service-side generation is an option on the normal write flow.
- `set --generate` requests service-side generation and is preferred when an Agent needs a random credential without seeing it.
- `set --value-stdin` accepts a caller-supplied value and avoids shell history leaks.
- `--value <secret>` is not supported.
- In a non-protected Environment, `secrets set --secret-name <display-name>` is create-or-update: zero matches creates a Secret Shape with a client-minted opaque Secret ID, one match writes a new Secret Version for that Secret, and multiple matches fail. The generated or resolved opaque Secret ID is returned in metadata-only output and used in audit records.
- Secret selectors are opaque IDs. Secret names are Display Names and never durable plaintext selectors.
- Mutations support `--comment`, `--json`, `--dry-run`, and `--idempotency-key`.
- Secret Reveal is not supported for Protected Environment secrets.
- Setting a value in one Environment never copies that value to another Environment.
- In a Protected Environment, `set` creates a Draft Version that is not eligible for Runtime Injection or Secret Sync.
- A Protected Environment has a Draft Area where unpromoted Draft Versions wait for human review.
- In a non-protected Environment, `set` can make the new version current immediately by default.
- `promote` for a Protected Environment creates a Promotion Change Set and Approval Request if the Protected Approval Policy is not yet satisfied.
- Promotion Change Sets contain exact Draft Version IDs in one Protected Environment.
- Promotion Change Sets do not support wildcard, query, tag, pattern, or "all staged changes" selection.
- Promotion Change Sets are immutable after the Approval Request is created.
- Draft Versions created after an Approval Request are not added to that request.
- Approval Requests notify authorized approvers through UI, email, or another configured channel.
- Approval Notifications are out-of-band alerts, not approval review surfaces. They include only low-privilege server-generated metadata such as Approval Request ID, generic purpose, created time, and a non-authorizing link to the authenticated approval view.
- Approval Notifications must not include Approval Context Note plaintext, Sensitive Values, Display Names such as organization/project/environment/secret names, decrypted Sensitive Metadata such as provider target names, provider-side names, policy binding names, security-relevant relationships, raw bodies, or approval impact details.
- Notification links route to the authenticated approval view and are not bearer approval tokens. Decrypted Sensitive Metadata in that view requires Sensitive Detail Gate.
- Protected Environment approval happens in the authenticated web app Human Approval Surface, not in a terminal-only flow. CLI commands may create the request, show metadata-only status, and poll the bounded operation.
- Approval Notification channels may include in-app notification, browser push, mobile push through a Capacitor-wrapped web app, email, or future channels.
- Browser push and mobile push through Push Device Registrations are the Primary Approval Notification Channel when available. In-app notifications and email are fallback channels.
- Browser/mobile push payloads are lock-screen safe and may contain only generic approval-pending text, opaque request references, created time, and non-authorizing deep links.
- Browser push and mobile push may deep-link into the authenticated web app approval view, but cannot approve, deny, or satisfy High-Assurance Challenge by themselves.
- Push Device Registrations are user/device scoped Sensitive Metadata. Creating a new registration, or replacing its device/browser/app installation or delivery endpoint, requires a High-Assurance Challenge. Registrations are audited on create/update/delete, revocable from account security controls, and invalidated on logout-all, MFA reset, suspicious activity response, lost-device response, user offboarding, and membership removal where appropriate.
- Failed push delivery or missing Push Device Registrations do not block approval review and do not relax approval requirements; the request remains pending in the authenticated app and may use fallback notifications.
- Email Approval Notifications are alert-only and must not contain approve, deny, or other approval action links.
- Approval Requests may include one optional Approval Context Note from the requester. It is untrusted explanatory text, not approval source of truth.
- Approval Context Notes are Sensitive Metadata: encrypted at rest, decrypted only after authorization and Sensitive Detail Gate for approval views or full-fidelity security review, and excluded from plaintext search indexes, logs, analytics events, durable queue payloads, unscoped caches, and error messages.
- Low-privilege JSON, operation status, and audit export output represent Approval Context Notes with immutable IDs, hashes, lengths, or presence flags rather than plaintext.
- Approval Context Notes are length-limited, escaped for display, visually separated from server-generated facts, and never rendered as HTML or active-link markdown.
- Approval Requests do not expire by age in V1; they remain pending until approved, explicitly canceled, or superseded.
- A Protected Environment may have only one pending promotion Approval Request.
- If Promotion is requested again for the same Protected Environment, the service creates a new immutable Promotion Change Set and Approval Request, then marks the prior pending promotion Approval Request as superseded regardless of requester.
- Approval Request Supersession coalesces Approval Notifications so approvers are pointed to the latest pending request.
- Promotion requests and Approval Notifications are rate-limited by actor, organization, and Protected Environment.
- Superseded Approval Requests cannot be approved, and stale approval views must show the superseded status.
- Protected Approval Policy defaults to one approving User with a High-Assurance Challenge, and may optionally require a second approving User.
- When multiple approvals are required, the requester cannot approve their own Approval Request.
- Machine Identities and Service Access cannot approve customer Approval Requests.
- Protected Environment delivery uses only the Published Version.
- Approving an Approval Request performs Promotion of the Promotion Change Set when the Protected Approval Policy is satisfied.
- Approval confirmation may show Display Names after authorization. It may show decrypted Sensitive Metadata, including Approval Context Notes and provider-side target details, only after Sensitive Detail Gate and before approval submission.
- Approval confirmation must render server-generated Promotion Change Set and Approval Impact Review facts as authoritative. Any Approval Context Note is shown only as untrusted context and cannot change the approved Draft Versions, delivery targets, warnings, or approval requirements.
- Approval confirmation warns, but does not block, when the Draft Area contains newer Draft Versions outside the Promotion Change Set; the warning should encourage requesting Promotion again if those Draft Versions should be included.
- A Promotion Change Set freezes Draft Version identity only; it does not freeze Secret Sync, Runtime Injection Policy, App Connection, or other delivery target configuration.
- Approval uses a metadata-only Approval Impact Review recomputed before approval.
- Approval Impact Review includes every enabled Secret Sync that Promotion will enqueue, including Cloudflare Worker Secret Deploy impact for exact Worker scripts and binding names.
- Approval submission must reject stale approval views when current delivery or sync impact differs from the impact the approver reviewed.
- Stale Approval Impact Review returns exit code `6` with stable code `approval.review_stale`, leaves the Approval Request pending, and does not perform Promotion, cancel the request, or mark it superseded.
- Approval Requests have exactly one approval purpose in V1.
- A promotion Approval Request contains one Promotion Change Set and cannot include protected delivery configuration changes.
- Protected delivery configuration changes carry distinct authority and audit from secret Promotion and are never merged into a promotion Approval Request; this is a separation of approval purpose, not necessarily a separate human interruption.
- A single Publish of a Staged Change Set may satisfy several such gates at once, clearing every gate the acting User is individually authorized to clear in one High-Assurance Challenge while still fanning out to a Distinct Approver wherever a multi-approval Protected Approval Policy requires one.
- Creating disabled Secret Syncs or disabled Secret Sync Bindings for a Protected Environment is a protected delivery configuration change, even though it does not sync yet.
- Protected delivery configuration changes include protected Secret Sync create/enable/binding changes, protected Runtime Injection Policy changes, protected App Connection changes, Connection Boundary changes, protected Shared Secret Source attachment, and repository-scoped provider sync overrides.
- `promote` cannot create, enable, or change Secret Sync destinations, Runtime Injection Policies, App Connections, Connection Boundaries, or other delivery targets.
- Promotion immediately enqueues every enabled Secret Sync affected by any promoted version in the Promotion Change Set and returns operation IDs/status metadata. The accepted Approval Impact Review authorizes those immediate syncs and deploy impacts; no second approval is required for already-enabled syncs.
- Environment-based delivery is Startup Configuration. Rapidly changing values should use a future dynamic secret/configuration mechanism, not repeated Promotion requests.
- Scheduling approval, Promotion, or sync is deferred for v1.
- `promote` requests or performs Promotion for one or more Draft Versions; it makes those Draft Versions Published Versions only after the Protected Approval Policy is satisfied.
- `rollback` creates a new Secret Version from a retained encrypted prior Published Version; it never reveals the old plaintext value to the caller and requires a High-Assurance Challenge for Protected Environments.
- Rollback eligibility is controlled by a configurable Rollback Retention Window.

### Staged Change Set And Publish

A Staged Change Set lets an agent or developer assemble a batch of not-yet-live changes in a non-protected development context, then make them live through one reviewed Publish. This is a plan-then-apply shape: stage everything, confirm the batch, and take a single human interruption at the end rather than one per change.

The canonical orchestration contract is [protected-change-orchestration.md](protected-change-orchestration.md). This CLI section describes the command shape that exercises that contract.

```bash
insecur staged show --json
insecur staged add-draft --staged-id stg_01JZ8EM4P7N9K3T5V8X1Z6C0A --env-id env_01JZ8E4R2P7M9N3K5T8V1X6Z0A --secret-id sec_01JZ8ETB7P2M9N3K5T8V1X6Z0A
insecur staged add-sync --staged-id stg_01JZ8EM4P7N9K3T5V8X1Z6C0A --sync-id sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A --disabled
insecur publish --staged-id stg_01JZ8EM4P7N9K3T5V8X1Z6C0A --dry-run --json
insecur publish --staged-id stg_01JZ8EM4P7N9K3T5V8X1Z6C0A
```

Rules:

- A Staged Change Set holds Draft Versions and pending configuration changes such as disabled Secret Syncs, Secret Sync Bindings, Shared Secret Source attachments, and policy changes, assembled freely while not live.
- App Connection setup is not staged. It is a live, human-performed prerequisite (see App Connections). If a Scoped List shows no App Connection covering the needed Connection Boundary, the agent must hand off to a human to create it before the batch can reference it.
- `publish --dry-run` returns a metadata-only Approval Impact Review over the whole batch: which Draft Versions promote, which Secret Syncs and Bindings activate, which policies change, and which gates the acting User can clear versus which require a Distinct Approver.
- `publish` performs Promotion of the batch's Promotion Change Set and activates its configuration changes in one reviewed action, metadata-only in human, agent, and JSON output, and never reveals Sensitive Values.
- A single Publish clears every gate the acting User is individually authorized to clear in one High-Assurance Challenge bound to the batch, and does not bypass any gate the User cannot satisfy.
- Where a multi-approval Protected Approval Policy applies, Publish still fans the promotion out to a Distinct Approver; batching never collapses a multi-approval policy into self-approval.
- The High-Assurance Challenge for a Publish is bound to a fingerprint of the exact batch contents, is single-use, and is time-limited; if the batch changes or the challenge expires, a fresh Publish review and challenge are required.

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
- `--json` reports delivery metadata only and never embeds Sensitive Values.
- `--watch` is development-only and should restart the child process after changes.
- Runtime injection is the preferred deploy and local command path because the caller receives metadata, not Sensitive Values.
- Developers should use runtime injection instead of `.env` files whenever the command can read from environment variables.
- Agents should receive Secret Use through runtime injection, not Secret Reveal.
- Production runtime injection requires the Storage Security Gate.
- Protected Environment runtime injection uses Published Versions only; Draft Versions are never delivered.
- Protected Environment runtime injection requires a server-owned Runtime Injection Policy.
- Non-protected runtime injection may select exact secrets for one command with repeated `--secret-id` or `--secret-name` flags. Protected Environments reject direct secret selection and require a Runtime Injection Policy.
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
- Creating, publishing, changing, or disabling a policy for a Protected Environment requires a High-Assurance Challenge.
- Policies constrain actor, Project, Environment, command shape, Command Fingerprint, exact secret bindings, TTL, and delivery mode.
- Creating or changing a policy creates a new immutable Runtime Injection Policy Version and updates the active version pointer.
- Used Runtime Injection Policy Versions cannot be mutated because audit must reconstruct the exact authorization state that produced an Injection Grant.
- Runtime Injection Policy Versions are retained indefinitely as non-plaintext audit metadata. Encrypted secret value rollback retention remains separately configurable.
- Runtime Injection Policy Versions store immutable secret IDs and historical Display Names for exact bindings as ordinary metadata.
- Runtime Injection Policy Version Sensitive Metadata, such as provider-side names, policy binding names, and security-relevant relationships, is encrypted at rest and displayed only after authorization and Sensitive Detail Gate. Only opaque IDs and Display Names remain plaintext for lookup.
- Runtime Injection Policy secret selection is exact bindings only. Wildcards, prefixes, suffixes, regexes, tags, folders, and pattern queries are not supported.
- The Runtime Policy Key resolves to exactly one Runtime Injection Policy, and that policy's active version resolves to its exact secret set.
- Environment Deploy Keys may be attached to Runtime Policy Key IDs, but cannot override the policy's exact secret bindings or command constraints at exchange time.
- Every Injection Grant records the Runtime Injection Policy ID and Runtime Injection Policy Version ID/hash used to authorize it.
- Exact bindings are required for forensic traceability. Audit events must be able to show which policy key, Runtime Injection Policy Version, secret bindings, and delivered secret version IDs were involved without recording Sensitive Values.
- Protected Environment policies require a Command Fingerprint when practical.
- Command Fingerprints may hash selected scripts, package manifests, lockfiles, compiled artifacts, or an explicit command bundle.
- Command, script, dependency, or bundle changes should change the Command Fingerprint and require reapproval before protected delivery continues.
- Policies do not contain Sensitive Values.

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
- Inside a git repository, non-protected file delivery refuses tracked files and files not matched by ignore rules unless an explicit break-glass flag is provided.
- Break-glass flags do not override Protected Environment file delivery denial.
- `--json` reports delivery metadata only and never embeds Sensitive Values.
- File delivery for dev uses that Environment's own values or Environment Defaults, never copied Protected Environment values.

### App Connections

```bash
insecur connections list --json
insecur connections create github --connection-id conn_01JZ8EFH2R7M4T0V9X3C5D8F1G --method github-app --display-name-stdin
insecur connections create vercel --connection-id conn_01JZ8EGK5Q2R7V0X3Z6C9D1F4H --method vercel-integration-oauth --display-name-stdin
insecur connections create cloudflare --connection-id conn_01JZ8EHM8S3V6X0Z2C5D8F1G4K --method scoped-api-token --display-name-stdin --allow-account-id cfacct_01JZ8ESV1N4M7T0V3X9Z2C8D5F --allow-worker-script my-api-production
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
- Cloudflare `create` requires an explicit connection boundary pinning the allowed account and allowed Worker script targets.
- Provider authorization callbacks for OAuth or app-install methods use one-time tenant-bound state tied to the intended Organization, initiating User, pending App Connection operation, Connection Method, and Connection Boundary.
- Callback completion re-checks the initiating User's current Organization Access and verifies provider account, installation, team, repository, project, worker, or resource identity before credentials are stored.
- Callback completion fails closed for replayed state, provider/issuer mix-up, canceled or superseded operations, Tenant Suspension, lost Organization Access, or provider identity mismatch.
- Creating an App Connection, replacing credentials, reauthorizing, or changing a Connection Boundary requires a High-Assurance Challenge.
- `rotate` and `reauth` create audited operations.
- An App Connection is organization-owned. It records the User who performed setup as `created_by` for audit, but it is not personal to that User and survives their offboarding or loss of Organization Access.
- App Connection setup is a one-time, live, human-performed action per Organization and provider, not a Staged Change Set item and not something a Machine Identity can perform. An agent that needs a missing connection must hand off to a human, surfaced as exit code `10`.

### Secret Syncs

```bash
insecur syncs list --json
insecur syncs create github-actions \
  --sync-id sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A \
  --connection-id conn_01JZ8EFH2R7M4T0V9X3C5D8F1G \
  --source-env-id env_01JZ8E4R2P7M9N3K5T8V1X6Z0A \
  --bind-secret sec_01JZ8ETB7P2M9N3K5T8V1X6Z0A=DATABASE_URL \
  --bind-secret sec_01JZ8ETJ4Q7M9N3K5T8V1X6Z0B=ADMIN_API_KEY \
  --target-repo-id repo_01JZ8EMW6Q1N4M7T0V3X9Z2C8D \
  --target-github-environment-id ghenv_01JZ8ENZ9S4V7X0C3F6H9K2M5P

insecur syncs create vercel-env \
  --sync-id sync_01JZ8EPB2R7V0X3Z6C9D1F4G5H \
  --connection-id conn_01JZ8EGK5Q2R7V0X3Z6C9D1F4H \
  --source-env-id env_01JZ8E4R2P7M9N3K5T8V1X6Z0A \
  --bind-secret sec_01JZ8ETB7P2M9N3K5T8V1X6Z0A=DATABASE_URL \
  --bind-secret sec_01JZ8ETJ4Q7M9N3K5T8V1X6Z0B=ADMIN_API_KEY \
  --target-project-id vercel_prj_123 \
  --target-env-id vercel_env_01JZ8EQR5Q2R7V0X3Z6C9D1F4H

insecur syncs create cloudflare-worker-secret \
  --sync-id sync_01JZ8ERS8S3V6X0Z2C5D8F1G4K \
  --connection-id conn_01JZ8EHM8S3V6X0Z2C5D8F1G4K \
  --source-env-id env_01JZ8E4R2P7M9N3K5T8V1X6Z0A \
  --bind-secret sec_01JZ8ETB7P2M9N3K5T8V1X6Z0A=DATABASE_URL \
  --target-script-name my-api-production

insecur syncs plan sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A --json
insecur syncs run sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A --operation op_123
insecur syncs status sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A --json
insecur syncs disable sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A --comment "Pause GitHub production sync"
insecur syncs delete sync_01JZ8EKR4P7M9N3K5T8V1X6Z0A \
  --confirm-delete-managed-copies \
  --comment "Remove GitHub production sync and provider copies"
```

Naming:

- The domain term is `Secret Sync`.
- The command group is `syncs` to avoid colliding with shell concepts and to make list/create/read/update/delete natural.

Security posture:

- Secret Sync is the native-platform and compatibility path.
- Secret Sync intentionally stores secret values in the destination provider's secret store until overwritten, rotated, or deleted.
- Secret Sync is one-way delivery from insecur to the provider.
- Secret Sync uses explicit Secret Sync Bindings from exact Secret IDs in the source Environment to provider-side secret or variable names.
- Secret Sync does not support all-secrets, tag, prefix, suffix, regex, folder, or pattern-based selection.
- Adding a Secret to an Environment does not add it to an existing Secret Sync.
- Changing Secret Sync Bindings for a Protected Environment requires the protected delivery configuration approval path.
- Secret Sync Bindings are authoritative for their provider-side destinations.
- Sync writes perform Provider Sync Overwrite for bound destinations: existing provider-side values are replaced without reading, comparing, preserving, or displaying the previous provider-side Sensitive Values.
- Removing a Secret Sync Binding creates a Managed Provider Delete for the provider-side secret or variable previously managed by that binding.
- Managed Provider Delete uses tracked provider metadata or managed-key identity, not Sensitive Values.
- Secret Sync Disable is the non-destructive pause action: it stops future writes and leaves provider-side managed copies in place with warnings.
- Secret Sync Deletion is destructive: it removes every Secret Sync Binding, creates Managed Provider Deletes for all provider-side copies managed by those bindings, and tombstones the Secret Sync for audit.
- Secret Sync Deletion requires explicit destructive confirmation such as `--confirm-delete-managed-copies`.
- Secret Sync Deletion can complete with warnings when provider cleanup fails; failed Managed Provider Deletes become Orphaned Managed Provider Copy records.
- Orphaned Managed Provider Copy warnings are user-visible and include provider target metadata, failure reason, retry state, and audit links, but no Sensitive Values.
- Orphaned Managed Provider Copy warnings use stable warning code `sync.provider_delete_incomplete`.
- Orphaned Managed Provider Copy warnings are not critical platform failures.
- Production Secret Sync requires the Storage Security Gate.
- Protected Environment Secret Sync uses Published Versions only; Draft Versions are never synced.
- Protected Environment Secret Sync create, enable, and manual run require a High-Assurance Challenge.
- Protected Environment setup and planning may perform exact, audited Explicit Provider Lookup with normal authorized scoped access to produce Provider Overwrite Warnings, but creating disabled Secret Syncs or disabled Secret Sync Bindings requires a High-Assurance Challenge or protected delivery configuration approval.
- Protected Environment setup, approval, enablement, and manual run fail closed with `provider.unavailable` when Explicit Provider Lookup cannot determine the safe status for every exact Secret Sync Binding destination.
- Non-protected setup, enablement, and manual run may proceed when Explicit Provider Lookup cannot determine overwrite status only with `sync.overwrite_status_unknown`, user-visible unknown-overwrite warning output, operation-scoped confirmation, and an audit event.
- CLI and automation must use a scoped flag such as `--allow-unknown-provider-overwrite` for unknown provider overwrite confirmation; generic `--yes` is not sufficient.
- After Promotion, every enabled Secret Sync affected by any promoted version enqueues immediately when it was included in the accepted Approval Impact Review.
- Disabled syncs remain disabled and are not enqueued by Promotion.
- Disabling a Secret Sync leaves provider-side managed copies in place, and status/plan output must warn that those copies still exist.
- Sync plan, run, status, and verification commands must not read Sensitive Values back from providers.
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
- Full-fidelity exports may include Sensitive Metadata only after authorization and Sensitive Detail Gate for security review.
- Full-fidelity exports may include Approval Context Notes only as Sensitive Metadata after authorization and Sensitive Detail Gate for security review.
- Low-privilege exports use immutable IDs and hashes and exclude Sensitive Metadata such as provider target names and policy binding names. Historical Display Names may appear as ordinary audit metadata.
- Low-privilege exports exclude Approval Context Note plaintext and may include only note IDs, hashes, lengths, or presence flags.
- `audit verify` checks the entry hash chain and HMACed manifest.
- HMAC verification proves integrity and authenticity to systems with the verification key; it is not public-key non-repudiation.

## Secret Sync Model

A `Secret Sync` maps selected Secrets from one insecur Environment to a target in a provider. It is not an environment-wide export.

Core fields:

- `id`
- `org_id`
- `project_id`
- `display_name_ciphertext`
- `kind`: `github-actions`, `vercel-env`, or `cloudflare-worker-secret`
- `connection_id`
- `source_env_id`
- exact Secret Sync Bindings: source Secret ID plus provider-side secret or variable name
- `target_config_ciphertext`
- provider target opaque IDs needed for joins or provider API calls
- `mapping_behavior`: `managed` or `merge`
- `auto_sync_enabled`
- `status`
- `last_planned_at`
- `last_synced_at`
- `last_operation_id`
- `created_by`
- `created_at`
- `updated_at`

Provider credentials live only on the app connection. A secret sync references the app connection and stores provider destination configuration, not provider tokens. Provider destination names and binding names are Sensitive Metadata; durable sync selectors are opaque IDs.

## Sync Lifecycle

### 1. Connect Provider

An organization admin creates an app connection.

- GitHub uses GitHub App installation where possible.
- Vercel uses Vercel Integration OAuth.
- Cloudflare uses a manually configured scoped API token with the minimum permission needed to update direct Worker secrets unless a suitable Cloudflare app/OAuth install flow becomes available for that API.
- OAuth and app-install callback state is tenant-bound and one-time use. A callback can complete only the pending connection or reauthorization operation that created it.

The app connection stores encrypted provider credentials as organization data.

### 2. Create Secret Sync

A project admin creates a secret sync under a project.

The API validates:

- Actor can use the app connection.
- Actor can read source secrets.
- Actor can create syncs for the project.
- Every Secret Sync Binding references an exact Secret ID in the source Environment.
- The request does not include all-secrets, tag, prefix, suffix, regex, folder, or pattern selectors.
- Target config shape is valid for the sync kind and stores opaque IDs as selectors.
- Protected Environment Secret Sync creation requires a High-Assurance Challenge.
- Protected Environment Secret Sync creation and binding changes may show Display Names after authorization, but show decrypted Sensitive Metadata for exact Secret Sync Bindings only after Sensitive Detail Gate and before approval submission.
- Protected Environment Secret Sync creation, enablement, and binding changes show that existing provider-side values for those exact bindings will be overwritten without Provider Readback.
- Protected Environment Secret Sync binding removal shows the resulting Managed Provider Deletes only after Sensitive Detail Gate and before approval submission.
- Sync plan output may use cached provider metadata, but it must not imply that execution can skip Sync Execution Revalidation.
- Each sync run revalidates Provider Account Linkage, credential scope, Connection Boundary, Sync Target identity, provider-side resource identity, exact Secret Sync Bindings, required provider protection state, and eligible source version immediately before Sensitive Value decrypt or provider writes.
- Provider Drift returns `sync.provider_drift`, blocks decrypt/write, and requires provider reauthorization or an approved configuration change before retry.
- Protected Environment Secret Sync Deletion shows all resulting Managed Provider Deletes before the protected delivery configuration approval path.
- Protected Environment GitHub Actions syncs target an existing GitHub Environment; the API must not create the GitHub Environment as part of sync setup.
- Creating or enabling a Protected Environment GitHub Actions sync blocks unless the target GitHub Environment has visible protection rules.
- Non-protected Secret Sync creation, enablement, and manual run may proceed when Explicit Provider Lookup cannot determine overwrite status only if output surfaces `sync.overwrite_status_unknown`, receives operation-scoped confirmation, records an audit event, and makes clear that a provider-side value may be replaced without Provider Readback. CLI and automation use `--allow-unknown-provider-overwrite`; generic `--yes` is rejected for this condition.

### 3. Plan

Planning computes the intended provider changes without writing values.

Plan output includes:

- Target resource identity.
- Target existence and provider-side protection summary where the provider exposes it.
- Secret Sync Binding IDs, Secret IDs, Display Names, provider-side destination names after Sensitive Detail Gate, and planned Managed Provider Deletes.
- For bound destinations that already exist in the provider, plan output reports a Provider Overwrite Warning and Provider Sync Overwrite intent without reading or comparing the provider-side Sensitive Value.
- For Cloudflare Worker secret targets, plan output labels every create, update, or delete as Cloudflare Worker Secret Deploy impact and shows the exact affected Worker script and binding names without Sensitive Values.
- For Protected Environments, plan output returns `provider.unavailable` and cannot produce an approval-ready result when any exact binding destination lacks completed Explicit Provider Lookup status.
- For non-protected Environments, plan output may continue when lookup status is unavailable with warning code `sync.overwrite_status_unknown`; later create, enable, or run requires operation-scoped confirmation before provider writes.
- Plan output reports `sync.source_value_missing` for any binding whose source lacks an eligible Current Version/Published Version.
- Secret Sync Deletion plans list every Secret Sync Binding that will be removed, every resulting Managed Provider Delete, and the sync tombstone/audit status.
- Provider capability warnings.
- Existing Orphaned Managed Provider Copies and retry cleanup state.
- Blocking safety failures, including missing GitHub Environment Protection for Protected Environment sync.
- Missing permissions.
- Whether reauthorization is required.

Plan output must not include Sensitive Values.

### 4. Run

Running the sync creates an operation, enqueues work, and returns the operation ID. Provider writes happen in queue consumers, not in the initial request.

The queued worker:

- Loads current source secret versions for non-protected sources.
- Blocks with `sync.source_value_missing` when any non-protected source binding has no Current Version.
- Performs Sync Execution Revalidation for actor, sync, source Environment, App Connection, Provider Account Linkage, Connection Boundary, and provider target constraints before decrypting Sensitive Values.
- For Protected Environment sources, loads only Published Versions and blocks with `sync.source_value_missing` if any selected secret has no Published Version.
- Revalidates that a Protected Environment GitHub Actions sync still targets an existing GitHub Environment before writing Sensitive Values.
- Blocks with `sync.provider_drift` before decrypting Sensitive Values if the target GitHub Environment no longer has visible protection rules.
- Decrypts Sensitive Values only inside request/job execution after Sync Execution Revalidation passes.
- Writes provider secrets using the app connection, overwriting existing provider-side values for exact Secret Sync Bindings without Provider Readback.
- For Cloudflare Worker secret targets, treats each provider write or managed delete as Cloudflare Worker Secret Deploy impact and records that impact in audit.
- Records managed provider keys where the provider supports metadata or where insecur can track them internally.
- Writes audit events for start, per-target result summary, and completion.
- Stores provider errors in normalized form.
- Updates operation status in the Tenant-Scoped Store after every meaningful state transition.
- Retries retryable provider failures with delay metadata.
- Sends exhausted failures to a dead-letter path for Service Access review.

### 5. Verify

Verification confirms provider state without exposing values.

Verification never reads provider-side Sensitive Values back, even if a provider API allows it. It checks metadata, update timestamps, key presence, protection status, and provider response status only.

Secret Import is a separate workflow, not sync verification or reconciliation. Import must use Safe Sensitive Input Paths and produce audit events. V1 Secret Import must not read Sensitive Values from provider secret stores.

Explicit Provider Lookup is metadata-only and exists only for Secret Sync setup, planning, and approval in V1. It is not a standalone CLI/API/UI probe. Its purpose is to check whether one exact Secret Sync Binding destination already exists and produce a Provider Overwrite Warning before sync approval or execution. Explicit Provider Lookup checks one exact configured provider-side name, target, or binding inside one App Connection and Connection Boundary. It must not list provider inventory, enumerate provider-side names, return unrelated provider objects, expose raw provider response bodies, or accept wildcard, prefix, empty, pattern, or list requests. It returns only minimal existence/status metadata, normalized Provider Lookup Status, provider object IDs where needed, safe hashes where needed, and no Sensitive Values. Failed lookups return stable safe codes such as `provider.lookup_not_found`, `provider.permission_denied`, `provider.boundary_mismatch`, and `provider.unavailable`; they must not return, log, audit, persist, or place in operation records provider-native error text, raw provider bodies, raw provider headers, stack traces, unrelated provider object names, or Sensitive Values. Every lookup is audited with actor, organization, project/environment when applicable, app connection, exact target/name/binding, provider response class, request ID, and operation ID. Protected Environment setup, approval, enablement, and manual run fail closed with `provider.unavailable` if lookup cannot determine every exact binding destination status. Non-protected setup, enablement, and manual run may continue after unavailable lookup status only with warning code `sync.overwrite_status_unknown`, operation-scoped confirmation, and an audit event. Generic `--yes`, stored defaults, and previous confirmations do not satisfy this condition. Provider-side secret and variable names, provider existence status, and provider target names are Sensitive Metadata. Explicit Provider Lookup does not create Secret Shapes, Secret Versions, Secret Syncs, Secret Sync Bindings, or placeholder records. It does not perform Provider Sync Overwrite. Sync only writes later through the normal confirmation or approval flow for exact bindings with eligible source versions. Orphaned Managed Provider Copies are cleanup metadata, not import sources.

Explicit Provider Lookup output is scope-bounded. Authorized full-fidelity setup, plan, approval, or detail output may decrypt provider-side names only after Sensitive Detail Gate, but default low-privilege or automation output uses opaque IDs, hashes, and safe status codes. Lookup operations must not place provider-side names in plaintext search indexes, logs, analytics events, durable queue payloads, unscoped caches, or error messages.

### 6. Retry Or Reauth

Retryable provider failures return retry metadata. Credential failures return `provider.reauth_required`.

Agents should be able to:

- Poll operation status.
- Retry with the same operation ID or idempotency key.
- Stop and report when human provider reauthorization is required.

## Sync Execution Runtime

Sync execution is queue-backed:

1. `syncs run` validates authorization and idempotency.
2. The API writes an operation record through the Tenant-Scoped Store.
3. The API enqueues a sync job.
4. The API returns an operation ID.
5. A queue consumer performs Sync Execution Revalidation, then provider writes, and records progress.
6. A Durable Object serializes provider writes for the same organization/provider/target.
7. `operations get` and `operations wait` report machine-readable state.

Runtime rules:

- Neon Postgres, reached only through the Tenant-Scoped Store, is the operation and audit source of truth.
- Queue messages contain operation IDs and target identifiers, not Sensitive Values.
- Sensitive Values are decrypted only inside the active queue consumer execution after Sync Execution Revalidation passes.
- Queue consumers treat Provider Drift as a non-retryable authorization/configuration failure until reauthorization or approved configuration change occurs.
- Queue consumers must not log decrypted values, raw provider request bodies, or raw provider response bodies.
- Retryable provider failures use delayed retries.
- Exhausted failures go to a dead-letter path.
- Concurrent runs for the same provider destination are serialized through a Durable Object execution gate.
- The Durable Object is coordination only; Postgres remains the operation and audit source of truth.
- Operation audit events include enqueue, lock acquisition, provider write summaries, retry, dead-letter, completion, cancellation, and lock release.
- Secret Sync Deletion operations may finish as `completed_with_warnings` when Orphaned Managed Provider Copies remain after provider cleanup failures.

## Sync Behavior

### Mapping Behavior

`managed`:

- insecur owns the target keys it writes.
- Removing a Secret Sync Binding creates a Managed Provider Delete for the provider key that binding previously managed.

`merge`:

- insecur writes only selected keys.
- Other provider keys are left alone.
- Removing a Secret Sync Binding still deletes only the provider key previously managed by that binding; unrelated provider keys are left alone.

### Disabled Sync Behavior

- Disabling a Secret Sync stops future writes.
- Disabling a Secret Sync does not delete provider-side managed copies.
- Plan and status output warn when disabled syncs still have provider-side managed copies.
- Disable is the safe pause path when provider-side copies should remain available to the provider workflow.

### Secret Sync Deletion

- Deleting a Secret Sync is destructive.
- Deleting a Secret Sync removes all Secret Sync Bindings.
- Deleting a Secret Sync creates Managed Provider Deletes for every provider-side copy managed by those bindings.
- Delete plans must show every binding removal and every Managed Provider Delete before confirmation.
- CLI deletion requires explicit destructive confirmation such as `--confirm-delete-managed-copies`.
- Protected Environment Secret Sync Deletion requires the protected delivery configuration approval path.
- After deletion completes, the Secret Sync is tombstoned for audit and cannot run again.
- If some Managed Provider Deletes fail, deletion still tombstones the Secret Sync and completes with warnings.
- Failed Managed Provider Deletes create Orphaned Managed Provider Copy records.
- Orphaned Managed Provider Copy records are shown in status/audit output and can be retried after provider permission, connectivity, or reauthorization issues are fixed.
- `operations wait` for deletion returns success status with warning metadata when only provider cleanup remains.

### Conflict Behavior

If the provider target changed since the last sync:

- Plan reports a conflict.
- Run refuses by default.
- `--force` may be allowed only for explicit Service Access action with a High-Assurance Challenge and audit reason.

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
- Repository-scoped GitHub Actions sync from a Protected Environment requires a High-Assurance Challenge, explicit high-risk override, and audit reason.
- GitHub secrets are write-only after creation, and insecur does not compare provider-side plaintext for any Secret Sync provider.
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

Kind: `cloudflare-worker-secret`

Target config:

- Account ID.
- Worker script name, including the concrete Wrangler environment script name where applicable.
- Secret binding names from exact Secret Sync Bindings.

Notes:

- Start with scoped Cloudflare API tokens for hosted sync.
- Use the minimum permissions needed to write direct secrets on the selected Worker scripts.
- Require a connection boundary and show it in `connections status`.
- Pin the target account and allowed Worker scripts inside the connection boundary.
- For Wrangler environments, target the concrete script name that Cloudflare deploys, such as `my-api-production`, rather than the insecur Environment Display Name.
- Worker code reads direct Worker secrets as normal environment bindings such as `env.DATABASE_URL`; insecur does not edit `wrangler` configuration.
- Writing, updating, or deleting a Cloudflare Worker secret creates provider-side deploy impact for that Worker script/environment. Protected plan, approval, run, status, and audit output must call this production deploy impact.
- Deleting a managed Worker secret can break the affected Worker at runtime, so managed deletes surface destructive warnings.
- If Cloudflare exposes a suitable OAuth/provider app flow for direct Worker secret management later, add it as a new connection method.
- Never accept global API keys.

## API Shape

Target API routes:

```text
GET    /v1/orgs/:org/projects/:project/environments/:env/approvals
POST   /v1/orgs/:org/projects/:project/environments/:env/approvals/:approval/approve
POST   /v1/orgs/:org/projects/:project/environments/:env/approvals/:approval/reject

GET    /v1/orgs/:org/projects/:project/environments/:env/secrets
POST   /v1/orgs/:org/projects/:project/environments/:env/secrets/:secret/versions
POST   /v1/orgs/:org/projects/:project/environments/:env/secrets/:secret/promote
POST   /v1/orgs/:org/projects/:project/environments/:env/secrets/:secret/rollback

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
- `.insecur.json` contains no Sensitive Values.
- `pull --out` writes values to an approved file with mode `0600`.
- Protected Environment file delivery is always denied.
- `run` injects values into the child process without printing them.
- The First Value Proof command sequence uses only normal `secrets set --generate` and `run --secret-name` commands, creates or updates only non-protected development resources, exercises non-protected `secrets set --secret-name` create-or-update behavior, runs the copyable verifier from `examples/first-value-proof/verify.mjs`, requires no provider connection, and returns metadata-only success/failure with no Sensitive Value, raw digest, child-process environment, local plaintext file, or provider state.
- Sensitive Values never appear in JSON output.
- No ordinary management command can reveal, read back, export, or log Sensitive Values by changing output format or adding a convenience flag.
- Protected Environment Blind Secret Write returns Draft Version metadata only.
- Protected Environment Promotion request returns Approval Request metadata/status only until approved, canceled, or superseded.
- Promotion Change Set tests cover exact Draft Version IDs, one Protected Environment, immutable payload, no wildcard/all-staged selection, and all-or-nothing Promotion.
- Pending Approval Request tests cover no age-based expiration and no automatic inclusion of newer Draft Versions.
- Approval Request Supersession tests cover repeat Promotion requests for the same Protected Environment regardless of requester, new immutable IDs, superseded stale-view denial, notification coalescing, and audit retention.
- Approval warning tests cover newer Draft Versions outside the Promotion Change Set without blocking approval.
- Approval Impact Review tests cover recomputed delivery/sync targets, enabled syncs that Promotion will enqueue, Cloudflare Worker Secret Deploy impact, metadata-only output, Sensitive Detail Gate before decrypted Sensitive Metadata display, stale approval-view denial, and pending request preservation.
- Approval Notification tests cover no Approval Context Note plaintext, no Sensitive Values, no Display Names such as organization/project/environment/secret names, no decrypted Sensitive Metadata such as provider target names, no raw bodies, no approval impact details, no bearer approval tokens, lock-screen safe browser/mobile push payloads, no approve/deny email actions, and authenticated-view-plus-Sensitive-Detail-Gate sensitive details for browser/mobile push deep links.
- Push Device Registration tests cover High-Assurance Challenge on new registration and registration replacement, user/device scoping, Sensitive Metadata storage protection, create/update/delete audit, user revocation, logout-all/MFA reset/suspicious activity/lost-device/offboarding invalidation, and no approval or High-Assurance authority from push alone.
- Approval fatigue tests cover actor, organization, and Protected Environment rate limits plus notification coalescing for superseded requests.
- Approval Context Note tests cover Sensitive Metadata encryption, Sensitive Detail Gate before display, no plaintext indexes/logs/analytics/low-privilege exports, length limits, display escaping, untrusted visual separation, no active HTML/markdown rendering, no warning suppression, no change-set mutation, and no policy influence.
- Display Name tests cover normal authorized display without Sensitive Detail Gate, scoped filtering, and exclusion from out-of-band Approval Notifications.
- Approval purpose separation tests cover rejection of combined Promotion plus protected delivery configuration changes.
- Non-protected Blind Secret Write updates Current Version immediately by default.
- Approved Protected Environment Promotion enqueues every enabled Secret Sync affected by any promoted version immediately when included in the accepted Approval Impact Review, reports operation IDs, and does not require a second deploy approval for already-enabled syncs.
- Secret Sync Binding tests cover exact Secret IDs, provider-side destination names, rejection of all-secrets/tag/prefix/pattern selection, and no automatic inclusion of newly created environment Secrets.
- Sync Execution Revalidation tests cover provider identity, credential scope, Connection Boundary, target identity, required provider protection state, source version eligibility, `sync.provider_drift`, and no Sensitive Value decrypt before the revalidation gate passes.
- Provider Sync Overwrite tests cover Provider Overwrite Warnings for exact existing destinations and overwriting existing provider-side values for exact bindings without Provider Readback, value comparison, value preservation, or Sensitive Values in output.
- Managed Provider Delete tests cover Secret Sync Binding removal deleting only the provider-side copy managed by that binding without Sensitive Value decrypt, and disabled sync warnings leaving provider copies intact.
- Secret Sync Deletion tests cover destructive confirmation, deletion of all bindings, Managed Provider Deletes for all managed provider-side copies, Protected Environment approval, tombstone audit retention, and no future runs after deletion.
- Secret Sync Deletion partial-cleanup tests cover `completed_with_warnings`, Orphaned Managed Provider Copy records, user-visible alerts, retry cleanup metadata, and no Sensitive Values in warning output.
- Secret Sync Disable tests cover non-destructive pause behavior and warnings for remaining provider-side managed copies.
- Cloudflare Worker Secret Deploy tests cover plan, approval, audit, and status output labeling protected Worker secret writes, updates, and deletes as production deploy impact for the exact target script and binding names without exposing Sensitive Values.
- Explicit Provider Lookup tests cover exact configured binding destinations only, one App Connection and Connection Boundary per lookup, no standalone probe command/API/UI, wildcard/prefix/empty/pattern/list request rejection, rate limits, audit events with exact target/name/binding and response class, safe Provider Lookup Status normalization, no provider-native error text, no provider-side Sensitive Value readback, and no Secret Shape, Secret Version, Secret Sync, Secret Sync Binding, or placeholder-record creation.
- Provider Overwrite Warning tests cover Secret Sync setup, plan, and approval warnings for exact provider destinations that already exist without exposing the provider-side Sensitive Value, provider inventory, unrelated names, provider-native error text, or raw provider bodies.
- Protected Explicit Provider Lookup tests cover `provider.unavailable` fail-closed behavior when Protected Environment setup, approval, enablement, or manual run cannot determine lookup status for every exact binding destination.
- Non-protected unknown-overwrite tests cover `sync.overwrite_status_unknown` behavior when setup, plan, enablement, or manual run proceeds despite unavailable lookup status, including operation-scoped confirmation, rejection of generic `--yes` alone, audit events, and no provider-native error text, raw provider bodies, provider inventory, unrelated provider object names, or Sensitive Values in output.
- Secret Sync source value tests cover `sync.source_value_missing` for missing Current Versions in non-protected Environments and missing Published Versions in Protected Environments.
- Secret Import tests cover Safe Sensitive Input Paths and prove provider-side Sensitive Values are not read back in V1.
- Protected Approval Policy covers one-approver and optional two-approver flows, requester self-approval denial, Machine Identity approval denial, and Service Access approval denial.
- Protected Environment Promotion, rollback, Secret Import, Runtime Injection Policy changes, Secret Sync enable/run, App Connection changes, repository-scoped overrides, protected Shared Secret Source attachment, and Push Device Registration creation/replacement enforce High-Assurance Challenges.
- Provider authorization callback tests cover one-time state, replay denial, post-callback Organization Access re-checks, provider identity verification, canceled/superseded operation denial, Tenant Suspension denial, and cross-tenant linkage denial.
- `--json` output is stable.
- Error code to exit code mapping.
- Idempotent retry behavior.

Sync:

- Cross-tenant connection use is denied.
- Cross-project sync access is denied.
- Plan does not expose Sensitive Values.
- Run uses only current secret versions.
- Removing a Secret Sync Binding deletes the provider key previously managed by that binding.
- Disabling a Secret Sync stops future writes without deleting provider-side managed copies.
- Deleting a Secret Sync removes all bindings, attempts to delete all provider keys previously managed by those bindings, and tombstones the sync.
- Provider cleanup failures during Secret Sync Deletion produce Orphaned Managed Provider Copy warnings rather than failed deletion when local destructive cleanup completed.
- Sync overwrites existing provider-side values for exact bindings without reading or comparing those values.
- Provider credential errors return `provider.reauth_required`.
- Retryable provider errors include retry metadata.
- Audit events are written for plan/run/verify/failure.
