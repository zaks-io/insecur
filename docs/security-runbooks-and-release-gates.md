# Security Runbooks And Release Gates

Security Runbooks And Release Gates is the Module that turns security requirements into repeatable operations and release evidence. Its Interface is metadata-only: runbooks describe how to act safely, release gates decide whether a deployment or product posture may proceed, and evidence bundles record what was checked without storing Sensitive Values.

The Module exists because security requirements are scattered across authentication, tenancy, cryptography, protected change orchestration, provider sync, runtime injection, audit, backup, and supply-chain docs. The leverage is one place to ask "can we ship or operate this safely?" The locality is one evidence model for runbook drills, release gates, security checks, and human review.

## Scope

This Module owns:

- The runbook template every security operation must follow.
- The runbook catalog required before valuable production secrets are stored.
- The release gate profiles for Small-Group Production, broad public signup, production deploys, migrations, and new sensitive delivery surfaces.
- The Security Evidence Bundle shape used by humans, agents, and CI.
- Stable control IDs and finding categories for future `pnpm security:check` automation.

This Module does not own:

- The underlying controls. Effective Access, Tenant-Scoped Store, Storage Security Gate, Protected Change Orchestrator, Sensitive Detail Gate, and delivery Adapters remain their own Modules.
- Incident authority. The runbook states required roles and High-Assurance Challenge requirements; it does not grant them.
- Secret inspection. Security evidence, runbook output, and gate output must never include Sensitive Values, decrypted Sensitive Metadata unless explicitly behind Sensitive Detail Gate, raw provider bodies, child-process environments, key material, or plaintext secrets.

## Runbook Interface

Every Security Runbook should have the same shape:

- `purpose`: what risk or incident it handles.
- `when_to_use`: triggers and non-triggers.
- `scope`: affected Instance, Organization, Project, Environment, provider, or key scope.
- `required_authority`: role, Authorization Scopes, Service Access, High-Assurance Challenge, or Machine Identity limits.
- `preconditions`: state that must be true before execution.
- `safe_inputs`: where any Sensitive Values or credentials may enter, if the runbook needs them.
- `dry_run`: metadata-only command or procedure that previews impact.
- `execute`: exact command or procedure for the operation.
- `verify`: command or procedure that proves the intended state.
- `expected_audit`: audit events and metadata that must exist afterward.
- `recovery`: rollback, retry, escalation, or terminal-state handling.
- `customer_communication`: whether owners or affected users must be notified.
- `evidence`: what metadata gets attached to the Security Evidence Bundle.

Runbook output is metadata-only by default. A runbook that needs decrypted Sensitive Metadata must require Sensitive Detail Gate and must state which fields may be shown. A runbook must not create a Protected Environment Secret Reveal path.

## Runbook Catalog

Write these before relying on insecur for valuable production secrets:

| Area | Required Runbooks |
| --- | --- |
| Bootstrap and onboarding | First tenant bootstrap; public onboarding abuse response; signup lockdown enable, verify, and disable. |
| Tenant operations | Tenant suspension and reinstatement; Service Access review; tenant export and deletion. |
| User and session response | User invitation and offboarding; lost or compromised human session. |
| Machine and provider custody | Machine identity credential compromise; app connection compromise or provider disconnect. |
| Secret lifecycle | Secret value rotation; Protected Environment secret replacement without reveal; Protected Environment emergency rollback from retained encrypted version. |
| Key management | Root key rotation; Organization Data Key rotation; Project Data Key rotation; failed or interrupted rotation job. |
| Backup and recovery | Neon Postgres restore from encrypted backup; emergency break-glass recovery without Protected Environment Secret Reveal. |
| Audit and investigation | Tamper-evident audit export and verification; suspicious audit activity investigation. |

## Release Gate Interface

A Security Release Gate consumes a Security Evidence Bundle and returns a metadata-only verdict:

- `profile`: `small_group_production`, `broad_public_signup`, `production_deploy`, `migration`, or `sensitive_surface_change`.
- `status`: `passed`, `blocked`, or `not_applicable`.
- `controls`: stable control IDs, status, evidence references, and blocking reason.
- `evidence`: test runs, review IDs, ADR links, runbook drill IDs, audit export IDs, migration IDs, dependency scan IDs, or CI job IDs.
- `expires_at`: when the evidence must be refreshed, if the control is time-sensitive.

`blocked` controls block release. If a product decision intentionally changes a control, record that as an ADR or explicit docs amendment; do not turn a blocked gate into a warning in the evidence bundle.

## Gate Profiles

| Profile | Applies Before | Must Include |
| --- | --- | --- |
| `small_group_production` | Storing valuable secrets for personal projects or trusted small groups. | Tenant-first authorization, WorkOS AuthKit/MFA, Storage Security Gate, Protected Change Orchestrator, audit/export integrity, backup/restore drill, no unsafe scaffold mode, no plaintext persistence, and required runbooks. |
| `broad_public_signup` | Enabling public self-service Organization creation or unrelated hostile tenants. | All Small-Group Production controls plus public onboarding abuse controls, quotas, tenant enumeration defenses, Signup Lockdown, Tenant Suspension, Service Access evidence, and rate-limit/abuse tests. |
| `production_deploy` | Deploying a production Worker release. | CI checks, security checks, dependency and secret scanning, migration compatibility, current runbook coverage, telemetry allowlist, and production approval evidence. |
| `migration` | Applying a production schema or RLS policy migration. | Elevated migration role review, backward-compatible migration plan, RLS policy coverage, fresh backup or snapshot, restore plan, and rollback-safe deploy order. |
| `sensitive_surface_change` | Adding or changing an auth method, app connection, sync destination, encryption path, runtime injection path, audit export, Service Access path, or Secret Egress path. | Threat model delta, ADR or design review, no-plaintext persistence review, metadata-safety review, runbook update, and targeted regression tests. |

## Control Map

| Control Group | Must Prove | Primary Evidence |
| --- | --- | --- |
| Threat model and ADR consistency | The release matches accepted decisions or records an explicit amendment. | ADR links, design review notes, threat model review. |
| Unsafe scaffold removal | No scaffold route, CLI command, setup path, auth mode, token flow, or deploy flag remains as a supported unsafe product path. | Code search, route/CLI inventory, setup docs review. |
| Authentication and session safety | WorkOS AuthKit, MFA, High-Assurance Challenge, secure cookies, CSRF, session rotation, and machine denial paths meet the plan. | Auth/session tests, ASVS mapping, manual review. |
| Tenant isolation | Effective Access, Tenant-Scoped Store, RLS, denial shape, Service Access, and cross-tenant tests hold. | Cross-tenant regression suite, RLS policy migrations, Service Access audit tests. |
| Storage readiness | Storage Security Gate passes for root key placement, tenant data keys, key versions, encrypted Provider Credentials and Sensitive Metadata, ciphertext identity binding, and no-plaintext persistence. | [storage-security-gate.md](storage-security-gate.md), canary tests, keyring/store tests. |
| Protected change orchestration | Protected changes apply only through current reviewed state, approval policy, stale checks, and metadata-only impact. | [protected-change-orchestration.md](protected-change-orchestration.md), approval lifecycle tests. |
| Secret sync and provider safety | Provider Lookup, Provider Drift, Sync Execution Revalidation, Provider Sync Overwrite, Managed Provider Delete, Provider Readback prohibition, and source-version eligibility hold. | Provider Adapter tests, audit events, operation records. |
| Runtime injection and machine custody | Protected Environment Injection Grants require Machine Identity credentials; human sessions and local agents cannot obtain them. | ADR-0038 tests, deploy key/OIDC tests, Injection Grant audit tests. |
| Metadata and telemetry safety | Sensitive Metadata encryption, Sensitive Detail Gate, no auto-capture telemetry, Secret-Free Logging, and low-privilege export behavior hold. | Canary tests, telemetry config review, audit export tests. |
| Backup, restore, and key rotation | Encrypted backups, restore verification, key rotation, credential rotation, and root-key escrow are drilled. | Runbook drills, restore reports, rotation verification reports. |
| Supply chain and CI | Dependency scanning, secret scanning, lockfile integrity, least-privilege CI, and required checks are active. | CI run IDs, scanner reports, branch protection settings. |

## Automation Contract

The future `pnpm security:check` should produce a stable JSON envelope:

```json
{
  "ok": false,
  "profile": "small_group_production",
  "status": "blocked",
  "controls": [
    {
      "id": "storage.gate",
      "status": "blocked",
      "blocking": true,
      "summary": "Storage Security Gate has not passed.",
      "evidence": [],
      "docs": ["docs/storage-security-gate.md"]
    }
  ]
}
```

Stable control ID prefixes:

- `auth.*`
- `tenant.*`
- `storage.*`
- `protected_change.*`
- `sync.*`
- `runtime_injection.*`
- `metadata.*`
- `audit.*`
- `backup_restore.*`
- `supply_chain.*`
- `runbook.*`

The local check may combine automated tests with required manual evidence placeholders. Placeholders are `blocked` until filled by a runbook drill, review, or explicit accepted decision.

## Invariants

- Security gates fail closed: missing evidence is `blocked`, not `passed`.
- Evidence is metadata-only and safe for agent context.
- Runbooks must prefer dry-run, explicit scope, and verification before destructive action.
- Every security runbook execution produces expected audit events.
- Service Access runbooks support investigation without Secret Reveal or Sensitive Values.
- Broad public signup is a separate gate above Small-Group Production, not a default consequence of V1 readiness.
- A production migration cannot proceed without RLS coverage evidence and a fresh recoverability path.
