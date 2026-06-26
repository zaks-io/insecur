# Runbook: Storage Security Gate Failure

Concrete Security Runbook following the interface in
[../security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).
Responds when production Secret Delivery or Secret Sync is blocked because the
[Storage Security Gate](../storage-security-gate.md) returns `blocked` or `unknown`.
Implements the operational path for control `storage.gate` in
[production-mvp-acceptance.md](../production-mvp-acceptance.md).

This runbook is metadata-only during triage. No step may bypass the gate, decrypt
Sensitive Values, or echo key material into a transcript or log.

## purpose

Identify which storage-readiness control failed, restore the minimum safe posture,
and unblock production delivery only after the gate passes with metadata evidence.
The gate exists so delivery never proceeds on partial storage safety.

## when_to_use

- **Triggers:**
  - Production Secret Sync or Runtime Injection returns a stable delivery-denial
    code before decrypt or provider write.
  - `sync.execution_denied` or `runtime_injection.grant_issue_denied` audit events
    cite storage-readiness controls in metadata.
  - `storage.gate` is `blocked` in a Security Evidence Bundle or release review.
  - `pnpm test:canary` or Plaintext Metadata Allowlist conformance fails in CI.
- **Non-triggers:**
  - Non-protected local Runtime Injection in the First Value development loop
    (carve-out in [storage-security-gate.md](../storage-security-gate.md)).
  - Authorization or approval denials with no storage-readiness control IDs.
  - Provider-only failures (`sync.revalidation_denied` with no storage controls).

## scope

One Instance and the Organization, Project, Environment, App Connection, or
delivery attempt named in the gate verdict. Root-key and tenant-data-key failures
are instance-wide; envelope or RLS failures may be tenant-scoped.

## required_authority

- **Readiness triage:** instance operator or on-call engineer with access to CI
  logs, migration status, and Cloudflare Secrets Store binding metadata.
- **Root-key remediation:** Super Administrator or Secrets Store Deployer/Admin per
  [instance-root-key-bootstrap.md](instance-root-key-bootstrap.md).
- **Schema/RLS remediation:** migration approver with elevated Postgres role per
  ADR-0029; never use the runtime role for structural fixes.

## preconditions

- The failing delivery attempt's request ID, operation ID, or audit event ID is
  recorded.
- CI or local `pnpm verify` output is available for the current commit.
- For root-key controls: Secrets Store bindings in `apps/runtime/wrangler.jsonc`
  are inspectable without reading key material.

## safe_inputs

No Sensitive Value enters this runbook during triage. Root-key repair follows the
bootstrap or rotation runbooks' safe-input rules when execution reaches key load.

## dry_run

Metadata-only blast-radius preview:

```bash
pnpm verify
pnpm test:canary
pnpm test:rls
pnpm conformance:topology
```

Review the gate verdict metadata (control IDs, evidence refs, denied delivery
scope) from the blocking audit event or operation record. Map each blocked control
to the readiness table in [storage-security-gate.md](../storage-security-gate.md#readiness-controls).

## execute

1. **Capture the verdict.** Record `status`, blocked control IDs, scope, and
   `error` code from the denial audit event or delivery API envelope. Do not retry
   production delivery until the control list is understood.
2. **Classify the failing control group:**
   - **Root key / Secrets Store:** follow [instance-root-key-bootstrap.md](instance-root-key-bootstrap.md)
     recovery or root rotation (Key management catalog row).
   - **Tenant data keys / key versions:** inspect tenant-scoped `data_keys` metadata
     under forced RLS; run keyring readiness tests (`@insecur/crypto` test suite).
   - **RLS / Tenant-Scoped Store:** confirm `pnpm test:rls` and Plaintext Metadata
     Allowlist conformance; apply missing policy migrations before re-checking.
   - **No-plaintext persistence:** run `pnpm test:canary`; fix the enumerated
     surface before any delivery retry.
   - **Envelope / credential binding:** run crypto envelope and provider-credential
     tests in `@insecur/crypto` and `@insecur/tenant-store`.
3. **Remediate the specific control** using the owning module's procedure. Do not
   disable the gate, add env-fallback key material, or route decrypt through the
   public API Worker (`apps/api` must never hold `INSTANCE_ROOT_KEY_V1`).
4. **Re-run readiness evidence** (see `verify`) before allowing production sync or
   protected Runtime Injection.

## verify

- `pnpm verify` passes, including `pnpm conformance:topology` (root key only on
  `apps/runtime`).
- `pnpm test:canary` passes (no-plaintext persistence control).
- `pnpm test:rls` passes when `DATABASE_URL_RUNTIME` is available.
- Targeted package tests for the remediated control pass (`@insecur/crypto`,
  `@insecur/tenant-store`, `@insecur/access` as applicable).
- A deliberate production delivery probe in a non-customer `-dev` scope succeeds
  with `sync.execution_completed` or `runtime_injection.grant_issued` and no
  storage-control IDs in the denial metadata.
- `storage.gate` control evidence can move to `passed` in the Security Evidence
  Bundle.

## expected_audit

- Denial events already emitted: `sync.execution_denied`,
  `runtime_injection.grant_issue_denied`, or `crypto.data_key_denied` with
  stable `result_code` and metadata-only `details` naming blocked control IDs.
- After remediation: matching success events for the re-tested delivery path.
- No audit row contains Sensitive Values, key material, or provider credentials.

## recovery

- **Unknown verdict (`unknown` status):** treat as `blocked`; do not deliver.
  Restore missing evidence (migrations, bindings, tests) before retry.
- **Partial fix:** if any required control remains blocked, keep production
  delivery disabled and escalate to the owning workstream.
- **Suspected key exposure during remediation:** escalate to
  [custody-material-compromise.md](custody-material-compromise.md); rotation alone
  is insufficient when extraction may have occurred.
- **Stop:** halt promotion of new protected secrets until `storage.gate` is
  `passed`; roll back only the infrastructure change that caused the regression,
  not tenant ciphertext.

## no_reveal_handling

- Triage uses metadata-only gate verdicts, audit `details`, and test output.
- Never paste decrypt output, provider tokens, or suspected secret values into
  tickets, transcripts, or runbook evidence.
- `list`, `status`, `plan`, and audit export paths stay low-privilege unless
  Sensitive Detail Gate explicitly authorizes decrypted Sensitive Metadata.
- Do not advise bypassing the gate, disabling RLS, or using plaintext env fallback
  for production.

## customer_communication

None for internal readiness failures on `-dev`. For a production Instance,
notify affected Organization owners only if delivery was incorrectly allowed or
if remediation requires a maintenance window; default is silent fix when delivery
remained fail-closed.

## evidence

Attach to the Security Evidence Bundle (`storage.gate` control group), all
metadata-only:

- Blocked control IDs and delivery scope from the initial verdict.
- CI run ID or local verify log ref showing passing readiness tests.
- Remediation commit SHA and migration IDs if schema/RLS changed.
- Re-test delivery audit event IDs (success path).
- Drill ID when exercised as a tabletop (`runbook.*`).
