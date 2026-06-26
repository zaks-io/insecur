# Runbook: Tamper-Evident Audit Export And Verification

Concrete Security Runbook following the interface in
[../security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).
Covers tenant-bounded export, hash-chain and HMAC manifest checks, and Ed25519
signature verification per [ADR-0014](../adr/0014-tamper-evident-audit-exports.md)
and [ADR-0045](../adr/0045-asymmetric-signing-for-audit-exports-in-v1.md).
Implements control `audit.integrity`.

This runbook produces metadata-safe evidence for investigations. Full-fidelity
exports with decrypted Sensitive Metadata require Sensitive Detail Gate and are
not the default.

## purpose

Export a tenant-qualified audit trail, verify its integrity independently, and
preserve metadata-only evidence for security review, incident scoping, or release
gates without trusting insecur to run the check.

## when_to_use

- **Triggers:**
  - Security review or incident needs a fixed audit window for one Organization.
  - `audit.integrity` control requires fresh verify evidence before production.
  - Custody-material or tenant-reported compromise runbooks need a signed export
    ([custody-material-compromise.md](custody-material-compromise.md)).
  - Periodic integrity drill or third-party verification request.
- **Non-triggers:**
  - Routine live tailing (`insecur audit tail`) when export immutability is not
    required.
  - Breach forensic archive to R2 (ADR-0048 long-term program; export is an input).

## scope

One Organization (`org_*` placeholder) and a bounded UTC time range. Exports are
tenant-bounded; cross-tenant export is out of scope.

## required_authority

- Organization owner or admin with audit export scope for the target Organization.
- For full-fidelity Sensitive Metadata: passed Sensitive Detail Gate in the Human
  Approval Surface.
- Verification can be performed by any party holding the published audit-export
  signing public key and (for HMAC) the verification secret.

## preconditions

- Audit signing key is bootstrapped and published per ADR-0045 (same custody model
  as root key per ADR-0028).
- HMAC verification secret is available to the verifying environment via env var
  (never committed).
- Export window fits product retention; act before expiry for incident scoping.

## safe_inputs

HMAC secret and signing public key enter only via environment variables
(`INSECUR_AUDIT_EXPORT_HMAC_SECRET`, `INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY` or
CLI `--hmac-secret-env` / `--signing-public-key-env`). Never pass secrets on the
command line where shell history captures them.

## dry_run

Preview export bounds without writing files:

```bash
insecur audit tail --json --org-id <org_id_placeholder> --limit 5
```

Confirm actor authorization, event volume, and that tail output is metadata-only.
For programmatic export sizing, use `exportTenantAuditEvents` row counts from an
authorized integration test environment.

## execute

1. **Choose window** (`--from` / `--to` ISO dates) and Organization ID.
2. **Export** tenant-qualified JSONL and manifest:

```bash
insecur audit export \
  --org-id <org_id_placeholder> \
  --from 2026-01-01 \
  --to 2026-01-31 \
  --json
```

Package seam: `exportTenantAuditEvents` in `@insecur/audit` builds the hash chain,
HMACed manifest, and Ed25519 signature over the canonicalized export.

3. **Store artifacts** in an integrity-protected location (object store or offline
   copy). Record SHA-256 of each file in evidence, not file contents.
4. **Verify** before relying on the export:

```bash
insecur audit verify ./audit-export.jsonl \
  --manifest ./audit-export.manifest.json \
  --hmac-secret-env INSECUR_AUDIT_EXPORT_HMAC_SECRET \
  --signing-public-key-env INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY \
  --json
```

CLI implementation: `runAuditVerifyCommand` → `verifyAuditExport` in
`@insecur/audit`.

## verify

- `verifyAuditExport` returns `ok: true` with matching `entry_count`, hash chain,
  HMAC, and Ed25519 signature against the published public key.
- Deliberate tamper test: one modified JSONL line fails verification with stable
  error metadata (see `packages/audit/test/audit-export.test.ts`).
- Export manifest includes `organization_id`, `time_range`, `entry_count`,
  `first_hash`, `last_hash`, `hmac_key_version`, `signing_key_version`, and
  `custody_evidence_refs` without Sensitive Values.
- Low-privilege export mode excludes Approval Context Note plaintext and decrypted
  Sensitive Metadata unless Sensitive Detail Gate authorized full fidelity.

## expected_audit

- Export action itself is auditable when invoked through product API/CLI (request
  ID, Organization scope, time range metadata).
- Exported entries retain tenant-qualified codes such as `access.denied`,
  `sync.execution_denied`, `approval.request_created`, and
  `machine_auth.github_actions_oidc_exchange_denied` with metadata-only `details`.
- Verification does not write product audit rows; record verify result in evidence.

## recovery

- **Verify fails:** treat export as untrusted; re-export from product audit log.
  Do not use a partial export for incident scope or legal hold.
- **Signing key rotation mid-window:** verify against the manifest's
  `signing_key_version` and published historical public keys (ADR-0045).
- **Missing HMAC secret:** Ed25519 path still allows independent integrity check
  when the public key is published; HMAC supplements systems with shared secret.
- **Stop:** halt investigation conclusions tied to a failed verify until a passing
  export exists.

## no_reveal_handling

- Default to low-privilege export: opaque IDs, hashes, lengths, presence flags.
- Full-fidelity Sensitive Metadata and Approval Context Notes only after Sensitive
  Detail Gate; never attach them to agent context or public evidence bundles.
- `verifyAuditExport` scans for forbidden Sensitive Value patterns in export
  payloads (`scanAuditExportForForbiddenSensitiveValues`).
- Do not paste export JSONL into chat, Linear, or PR comments.

## customer_communication

Generally none for internal integrity drills. For tenant-requested export under
contract, deliver artifacts through approved secure channel; notification is
policy-driven, not technical.

## evidence

Attach to the Security Evidence Bundle (`audit.integrity`), all metadata-only:

- Export manifest `organization_id`, time range, `entry_count`, hash anchors.
- File hashes (SHA-256) for JSONL and manifest paths.
- Verify command result (`ok`, `schema_version`, control summary).
- Signing key version ID and public key fingerprint (not private key).
- Runbook drill ID when table-topped (`runbook.*`).
