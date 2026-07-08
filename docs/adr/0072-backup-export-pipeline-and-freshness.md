# ADR-0072: Backup Export Pipeline And Freshness Contract

Date: 2026-06-12

Status: Accepted

## Decision

[ADR-0058](0058-minimal-backup-and-tested-restore.md) decided the recovery model: one scheduled
daily independent encrypted logical export landed in R2, RPO 24 hours, encrypted under the existing
instance custody chain with no separate backup key. It deliberately did not decide where the export
runs, how it reads across tenants under forced RLS, or what the envelope is. This ADR completes
that model so the implementing architecture group does not guess, and adds the continuous freshness control
the one-time restore drill cannot provide.

**Venue: the export runs inside the Worker, on a Cloudflare cron trigger.** The forcing constraint
is the root key, not the database credential. ADR-0058 requires the artifact to be encrypted under
the existing instance custody chain, and the root key is resolvable only inside the Worker through
the Cloudflare Secrets Store binding:
[ADR-0028](0028-instance-secrets-in-secrets-store-with-escrow.md) makes the binding the only
accepted production root-key source, and
[ADR-0064](0064-minimize-secret-resident-surface.md) refuses the plaintext environment fallback in
production and resolves the key on demand, never process-global. An external job holding
`DATABASE_URL` alone would not violate custody — CI already holds the elevated migration URL
([ADR-0029](0029-environments-and-cd-trust-model.md),
[ADR-0054](0054-tenant-isolation-tests-real-postgres.md)) — but it could not seal the artifact
under the custody chain without root-key material leaving the Worker, which is the hard violation.
Encryption therefore pins the venue, and the venue pins the reader: the export streams rows over
the existing Hyperdrive binding ([ADR-0036](0036-neon-postgres-over-hyperdrive-with-rls.md)) and
lands the sealed artifact in R2, which
[ADR-0027](0027-shared-instance-topology-and-binding-map.md)'s fixed binding map already reserves
for encrypted backups.

The cron trigger does not contradict
[ADR-0057](0057-inline-sync-execution-and-partial-failure-model.md). Its "no background sweeper or
cron" consequence is scoped to sync-operation resumption: an `incomplete` Operation waits for a
human or agent to resume it by ID, and nothing here changes that. The backup cron starts a new
scheduled Operation on a fixed cadence; it never resumes, retries, or sweeps parked Operations.
Topologically it is a trigger on the existing Worker, not a new compute primitive or binding, so
ADR-0027's map is unchanged.

**Cross-tenant read path: per-organization scoped transactions on the existing runtime role.**
[ADR-0037](0037-tenant-scoped-bound-store-over-rls.md) forces row-level security with a
`NOBYPASSRLS` runtime role, so a naive whole-instance read through the Tenant-Scoped Store fails
closed by design. The export reads in two steps, both through the store. First, one narrow
transaction under the Service Access scope kind (`app.service`, the engine's only
cross-organization gate per ADR-0037, already implemented in the tenant-store policy step)
enumerates organization IDs and nothing else, and is audited. This is an internal, metadata-only
use of the engine scope by the cron handler, not the deferred
[ADR-0019](0019-service-access-without-secret-reveal.md) Service Access product surface; the
ADR-0019 boundary constraints hold trivially because the enumeration returns no values of any kind.
Second, the handler iterates the IDs and exports each organization's rows in its own short
`app.current_org`-scoped transaction — the exact transaction shape ADR-0036's transaction-mode
pooling is built around.

The consistency semantics are explicit: there is no single global snapshot. The artifact is a set
of per-organization snapshots, each internally consistent because each organization is read in one
transaction, taken at slightly different instants within one export run. That is acceptable because
no tenant-owned row references another organization's rows — ADR-0027's row model keys every
tenant row by `org_id` or reaches it through an organization-owned parent — so there is no
cross-organization invariant the skew could break, and the skew, bounded by the run's wall clock,
is noise against a 24-hour RPO. The artifact records a per-organization snapshot timestamp so a
restore states exactly which instant each tenant reflects. An organization created after the
enumeration is captured by the next daily run, within RPO.

**Artifact and envelope.** The artifact is canonical JSONL: table-tagged row objects, exported
exactly as stored. The export never decrypts anything — Sensitive Value ciphertext stays
ciphertext, wrapped data keys stay wrapped — so the artifact's restorability rests on the same
escrowed root key the live instance rests on, which is ADR-0058's collapse of the Neon-loss and
root-key-loss drills into one. On top, each export mints a fresh random export DEK and seals the
artifact with AES-256-GCM through the existing
[ADR-0026](0026-encryption-envelope-below-per-domain-wrappers.md) engine; the DEK is stored wrapped
under the current root key version — wrapped, not derived, matching the ADR-0005/ADR-0028
amendments — with AAD binding the instance ID and the export timestamp. The export DEK wraps
directly under the root rather than under a tenant data key because the artifact is instance-scope:
tying a whole-instance artifact to one tenant's key would be wrong, and minting a separate backup
custody chain was already rejected in ADR-0058. The artifact header records `root_key_version`
(plus the wrapped DEK, nonces, and format marker) so a restore selects the right escrowed root
version during a rotation window; an escrowed root version stays retained as long as any retained
artifact still wraps under it.

**Observability.** Every export run is an Operation: intent code `backup.export` in the
`packages/operations` intent-code catalog, moving `pending → running → succeeded | failed`,
created with an idempotency key derived from the scheduled timestamp so a duplicate cron fire
returns the
existing Operation under ADR-0066 semantics instead of double-running. A failed run ends `failed`;
recovery is the next scheduled run or an ad hoc invocation, never a same-ID background resume,
consistent with the ADR-0057 reconciliation above. Operations and audit events are tenant-qualified
rows under forced RLS, so instance-scope backup runs are recorded under the recovery-canary
sentinel organization ADR-0058 already requires — it exists precisely to prove backup and restore,
and parking backup Operations and their audit events there keeps the Operation Store's
tenant-qualified invariant intact with no schema change. The canary organization existing is a
precondition of the first export, which is coherent: the canary must be in the artifact for the
drill to verify anything. Success and failure emit audit events with the stable codes
`backup.export_succeeded` and `backup.export_failed`, and a failure additionally emits a
metadata-only alert through the [ADR-0030](0030-hybrid-allowlisted-telemetry.md) allowlisted
telemetry sink so the operator is paged rather than discovering staleness later.

**Freshness control.** A new continuously evaluated control `backup_restore.export_fresh`: when the
latest successful export is older than 48 hours, the control is `blocked` in the
`small_group_production` profile. Evidence uses the gate interface's existing `expires_at`
semantics in
[docs/security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md): each
`backup.export_succeeded` refreshes the evidence with `expires_at` set 48 hours out. Against a
24-hour cadence, 48 hours gives exactly one missed run of self-heal headroom before the operating
posture blocks. The control is deliberately not in the `production_deploy` profile: a failed
exporter must never block the Worker deploy that fixes the exporter, and the gates doc forbids
downgrading a blocked control to a warning, so placing it there would wedge recovery. Deploy-time
freshness is already owned by the `migration` profile's fresh-backup-or-snapshot requirement.
Control-ID housekeeping rides along: the gates doc's stable prefix is `backup_restore.*` while
production-mvp-acceptance currently uses `backup.restore`; that row normalizes onto the prefix,
applied by the acceptance-doc owner.

**One pipeline, two triggers.** ADR-0029's pre-apply migration backup ("a fresh R2 backup or
snapshot taken immediately before apply") is this same pipeline and artifact: invoked ad hoc before
a production migration apply, the handler produces the identical format and envelope, so there is
exactly one backup mechanism, one importer, and one drill. A Neon snapshot remains an acceptable
pre-apply alternative per ADR-0029's existing wording, since the migration-misbehaved scenario has
the Neon account intact; what is not acceptable is an agent building a second bespoke export
mechanism.

**The restore drill consumes the latest real scheduled export**, never a hand-made artifact.
ADR-0058's drill steps are unchanged; this pins the drill's input so it exercises the actual cron
output, the actual envelope, and the bespoke importer end to end.

## Options Considered

- **`pg_dump` on an external CI cron.** The honest advantage is standard tooling: `pg_restore` is
  battle-tested and the bespoke JSONL importer would not need to exist. Holding `DATABASE_URL` in
  CI is even precedented, since ADR-0029/ADR-0054 already hold the elevated migration URL there.
  Rejected because there is no posture-consistent encryption path: sealing the artifact under the
  instance custody chain in CI requires root-key material leaving the Worker (the hard violation
  per ADR-0028/ADR-0064), encrypting to a CI-held public key is the separate backup custody chain
  ADR-0058 already rejected, and an unencrypted artifact parks every tenant's unencrypted metadata
  in R2.
- **A dedicated read-only export role via a second Hyperdrive configuration bound only to the cron
  handler.** Buys a single global snapshot in one transaction. Rejected: Cloudflare bindings attach
  to the Worker, not to a handler, so the RLS-exempt read credential would be reachable from every
  code path in the isolate, and "only the cron handler uses it" is application discipline —
  exactly the discipline-only boundary ADR-0036 added engine-enforced RLS to backstop — and it
  re-opens the
  cross-tenant read that a SQL-injection foothold loses under ADR-0037's fail-closed design. It
  also adds a third database role and a second Hyperdrive configuration to provision and rotate.
  The forgone global snapshot protects no invariant, per the consistency semantics above.
- **One whole-instance transaction under the existing `app.service` scope.** A global snapshot with
  no new credential. Rejected: a single transaction spanning the full instance dump is the
  long-held-transaction shape ADR-0036 warns defeats Hyperdrive's transaction-mode pooling, it
  grows with data volume, and it holds the cross-organization scope open for the longest-running
  operation in the system. Per-organization transactions confine `app.service` to an IDs-only
  enumeration.

## Consequences

- A bespoke JSONL importer is part of the restore path, and the drill consuming the latest real
  scheduled export is what keeps that importer honest. The cost of forgoing `pg_restore` is
  accepted as the price of a posture-consistent envelope.
- Worker limits bound the export: a cron invocation gets minutes of CPU and wall clock, not hours.
  At prove-concept volume a streamed JSONL export fits comfortably; the recorded escape hatches are
  R2 multipart upload with per-organization parts and splitting organizations across consecutive
  invocations. The revisit trigger is an export run approaching the invocation limits.
- A silently failing exporter is now bounded instead of unbounded: the failure pages through the
  ADR-0030 sink, and if the page is missed, `backup_restore.export_fresh` blocks the small-group
  operating posture within 48 hours rather than leaving RPO unbounded until the day Neon is
  actually lost.
- Propagation is owned by the named docs, not edited here:
  [docs/security-plan.md](../security-plan.md) section 8 and the product spec's recovery section
  carry the venue and envelope;
  [docs/security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md) gains
  `backup_restore.export_fresh` in its Control Map and `small_group_production` profile;
  [docs/production-mvp-acceptance.md](../production-mvp-acceptance.md) gains the freshness clause
  and the `backup_restore.*` control-ID normalization; ADR-0058 gains a cross-reference to this
  ADR. The "Neon Postgres restore from encrypted backup" runbook carries the importer and
  header-version selection steps when it is written.
- The first-export precondition (the recovery-canary sentinel organization exists) front-loads part
  of the ADR-0058 drill gate, so the canary stops being a drill-day artifact and becomes standing
  state the daily export continuously re-captures.
