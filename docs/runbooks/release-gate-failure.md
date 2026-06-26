# Runbook: Security Release Gate Failure

Concrete Security Runbook following the interface in
[../security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).
Responds when `pnpm security:check` (alias `pnpm release-gate:bundle`) or a
production release review returns `blocked` or `missing_evidence` for one or more
controls in the Security Evidence Bundle.

## purpose

Triage a failed release gate, collect or refresh metadata-only evidence, and
restore a fail-closed posture until blocking controls pass or an explicit ADR
records an accepted exception.

## when_to_use

- **Triggers:**
  - `pnpm security:check` exits non-zero locally or in CI.
  - `production_deploy` or `small_group_production` profile review is blocked.
  - Pre-deploy checklist shows `missing_evidence` for supply-chain or auth
    checklist controls.
  - Evidence bundle contains forbidden reveal keys (assembler rejects unsafe
    artifacts).
- **Non-triggers:**
  - Single unit test failure in unrelated package (fix test; gate may still pass if
    `supply_chain.verify` evidence current).
  - Product feature bug without security evidence impact.
  - Deferred `broad_public_signup` controls when that profile is not exercised.

## scope

One release candidate (commit SHA, CI run, or deploy tag) and the gate profile
(`production_deploy`, `small_group_production`, `migration`,
`sensitive_surface_change`).

## required_authority

- Engineer with access to CI artifacts and `evidence/` directory layout.
- Release approver for production deploy profile.
- Security reviewer for checklist controls (`auth.asvs_checklist`,
  `auth.api_top10_checklist`).

## preconditions

- Evidence directory default: `evidence/` relative to repo root (override with
  `--evidence-dir`).
- CI jobs produce metadata-only scanner summaries (no secret substrings in
  secret-scan artifacts per release-gate rules).
- Blocking controls are not waived without ADR or docs amendment.

## safe_inputs

Evidence JSON files are metadata-only. Secret-scan artifacts record
`finding_count` and `rule_ids` only; never commit matched secret content.

## dry_run

Assemble bundle without deploying:

```bash
pnpm security:check
# or
pnpm release-gate:bundle --profile production_deploy --evidence-dir ./evidence
```

Package seam: `assembleSecurityEvidenceBundle` in `@insecur/release-gate` reads:

| Control ID                        | Evidence artifact                               |
| --------------------------------- | ----------------------------------------------- |
| `supply_chain.verify`             | `evidence/verify.json`                          |
| `supply_chain.dependency_scan`    | `evidence/supply-chain/dependency-scan.json`    |
| `supply_chain.secret_scan`        | `evidence/supply-chain/secret-scan.json`        |
| `supply_chain.sbom_vulnerability` | `evidence/supply-chain/sbom-vulnerability.json` |
| `auth.asvs_checklist`             | `evidence/security/asvs-checklist.json`         |
| `auth.api_top10_checklist`        | `evidence/security/api-top10-checklist.json`    |

Review `controls[].status`, `blocking_reason`, and `docs` links in output.

## execute

1. **Identify blocking controls** from bundle `status: "blocked"` or
   `missing_evidence`.
2. **Per control remediation:**
   - `supply_chain.verify`: run `pnpm verify`; attach CI log ref to
     `evidence/verify.json`.
   - `supply_chain.dependency_scan` / `secret_scan` / `sbom_vulnerability`:
     refresh CI scanner artifacts into `evidence/supply-chain/`.
   - `auth.asvs_checklist` / `auth.api_top10_checklist`: complete checklist JSON
     with `status: "passed"` or honestly `blocked` with `checklist_ref`.
   - Cross-cutting controls (`storage.gate`, `backup_restore.drill`,
     `audit.integrity`, `runbook.catalog`): run the matching runbook in this
     catalog and attach drill IDs.
3. **Re-assemble** bundle; `assertBundleIsMetadataSafe` must pass.
4. **Production deploy:** only promote when `bundle.ok === true` for the target
   profile.
5. **Record** ADR link if intentionally accepting a blocked control (never
   downgrade to warning in the bundle).

## verify

```bash
pnpm security:check --profile production_deploy
echo $?  # expect 0 when ok
```

- Bundle `schema_version`, `profile`, `ok: true`, all blocking controls
  `passed`.
- No evidence file contains forbidden reveal keys (`assertBundleIsMetadataSafe`).
- `supply_chain.secret_scan` shows `finding_count: 0` or documented waiver with
  ADR.
- Related runbook drills referenced by `runbook_drill` evidence kind where
  required by `runbook.catalog`.

## expected_audit

Release gate assembly is local/CI metadata; product audit is unaffected. Record:

- CI job IDs in evidence artifacts.
- Human release approval record external to insecur (change ticket).
- Runbook drill IDs in evidence refs when drills satisfied gating controls.

## recovery

- **Missing evidence:** fail closed; fill placeholders before deploy.
- **Stale evidence:** refresh `checked_at` and `expires_at` (e.g.
  `backup_restore.export_fresh` 48h window).
- **Scanner findings:** fix or waive via ADR; never strip findings from reports
  to pass gate.
- **Stop:** halt production deploy until `ok: true`; roll back deploy only if a
  bad release slipped past gate (separate incident runbook).

## no_reveal_handling

- Evidence bundle and scanner artifacts are metadata-only by construction.
- `summarizeSecretScanEvidence` exposes counts and rule IDs, not matched strings.
- Do not paste CI logs containing env secrets into evidence JSON.
- Gate output safe for agent context when metadata-safe assertion passes.

## customer_communication

None for internal CI failures. Production delay communications follow normal
release management if deploy date slips.

## evidence

The bundle itself is the evidence artifact. Store:

- `security-evidence-bundle.json` output path with `generated_at` and control
  statuses.
- CI run URLs / job IDs referenced in per-control `evidence` refs.
- ADR or Linear issue ID for any accepted `blocked` override.
- Runbook drill IDs linked from `runbook.catalog` controls.
