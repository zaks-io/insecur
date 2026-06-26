# Runbook: App Connection Compromise Or Provider Disconnect

Concrete Security Runbook following the interface in
[../security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).
Responds to suspected exposure of stored Provider Credentials or the need to
revoke provider-side access for an Organization-owned app connection.

## purpose

Disconnect or rotate compromised provider credentials, stop Secret Sync from using
the connection, and drive tenants to reconnect with fresh provider authorization
without revealing stored tokens in operator output.

## when_to_use

- **Triggers:**
  - Provider token appeared in logs, tickets, or a third-party leak database.
  - Unexpected Secret Sync to destinations outside the Connection Boundary.
  - `sync.execution_denied` or `sync.revalidation_denied` after provider reported
    revocation.
  - Tenant reports unauthorized provider writes traceable to an app connection.
  - Offboarding or provider account change requires disconnect.
- **Non-triggers:**
  - Instance-wide Provider Credential / root-key scope (escalate to
    [custody-material-compromise.md](custody-material-compromise.md)).
  - Sync blocked solely by Storage Security Gate (use
    [storage-security-gate-failure.md](storage-security-gate-failure.md)).
  - Machine Identity compromise without provider credential exposure (use
    [machine-identity-credential-compromise.md](machine-identity-credential-compromise.md)).

## scope

One Organization (`org_*`) and one or more `app_connections` rows
(`conn_*` placeholders) plus dependent `secret_syncs`. Provider app client secrets
in Secrets Store are instance-scoped; tenant connection compromise does not
automatically imply instance client secret rotation unless forensics require it.

## required_authority

- Organization admin with app-connection management scopes.
- High-Assurance Challenge for create, reauth, rotate, disconnect, and Connection
  Boundary changes.
- Provider-side admin to revoke tokens, app installations, or API keys at GitHub,
  Cloudflare, or Vercel.

## preconditions

- Connection ID and provider (`github`, `cloudflare`, etc.) identified from audit
  or sync metadata.
- Storage Security Gate passed for production credential use, or sync already
  blocked fail-closed.
- OAuth callback state machine is not mid-flight for the same connection operation.

## safe_inputs

Provider tokens enter only through stdin or masked prompts on `connections create`
and rotate flows; never `--token <value>`. Operator procedures must not read
decrypted credentials from the database.

## dry_run

```bash
insecur connections status <conn_id_placeholder> --json
insecur connections rotate <conn_id_placeholder> --dry-run --json
insecur syncs list --json
```

Preview:

- Connection status, provider, Connection Boundary metadata (opaque IDs).
- Dependent sync IDs and `last_operation_id` without provider credentials.
- Rotate/reauth operation plan via Operation Store metadata (`provider.reauth`
  intent in `OPERATION_INTENT_CODES`).

## execute

1. **Disable delivery:** pause or disable dependent Secret Syncs before credential
   change when possible (`syncs disable` or approval-gated disable for protected
   environments).
2. **Disconnect** the app connection when revocation is required:

```bash
insecur connections disconnect <conn_id_placeholder>
```

API seam: `POST /v1/orgs/:org/connections/:connection/disconnect` (target contract
in [cli-and-sync.md](../cli-and-sync.md)).

3. **Or rotate/reauth** when the connection should remain with fresh credentials:

```bash
insecur connections reauth <conn_id_placeholder>
insecur connections rotate <conn_id_placeholder> --json
insecur operations wait <op_id_placeholder> --json
```

4. **Revoke upstream** at the provider (delete GitHub App installation, revoke
   Cloudflare API token, etc.) per provider docs; insecur disconnect does not
   replace provider-side revocation.
5. **Audit export** the window per
   [audit-export-and-verification.md](audit-export-and-verification.md).
6. **Tenant handoff:** human reconnects provider through the web connection wizard
   (app connection setup is human-only per cli-and-sync; agents must exit `10`).

## verify

- `connections status` shows `disconnected` or active with new credential version
  metadata (key version / rotation timestamp without token values).
- `sync.execution_denied` or disabled sync state prevents provider writes using
  old credentials.
- `sync.revalidation_denied` if boundary or credential no longer matches.
- Provider API confirms old token invalid.
- No Provider Credential plaintext in operation records (`pnpm test:canary` surfaces).

## expected_audit

- Long-running `provider.reauth` operations in Operation Store with metadata-only
  progress.
- `sync.execution_denied` / `sync.revalidation_denied` when sync attempts use
  revoked credentials.
- App connection lifecycle events when API/CLI surfaces are wired (connection ID,
  provider, action; no credential material).
- High-Assurance Challenge cleared for rotate/disconnect bounded operations.

## recovery

- **Disconnect stranded syncs:** syncs remain disabled; status warns managed
  provider copies may still exist (cli-and-sync Secret Sync rules).
- **OAuth callback replay:** fail closed; restart `connections create` / `reauth`.
- **Protected Environment sync:** protected delivery configuration approval may be
  required to re-enable; do not bypass approval.
- **Stop:** do not re-enable production sync until Storage Security Gate and
  connection boundary checks pass.

## no_reveal_handling

- `connections list`, `status`, and `show` never return provider credentials.
- Provider error normalization stores codes and safe summaries only (cli-and-sync).
- Disconnect/rotate output is metadata-only (connection ID, operation ID, status).
- Never paste provider tokens into tickets or evidence bundles.

## customer_communication

Notify Organization owners when provider credentials may have been used by an
unauthorized party. Instruct them to revoke at the provider and reconnect through
the authenticated web app. Include upstream revocation steps insecur cannot perform.

## evidence

Attach to the Security Evidence Bundle (`sync.*` / `protected_change.*`), all
metadata-only:

- App connection ID(s), provider, action (`disconnect`/`rotate`/`reauth`).
- Operation IDs and terminal states.
- Provider revocation confirmation reference (ticket ID, not token).
- Audit export verify result for incident window.
- Runbook drill ID (`runbook.*`).
