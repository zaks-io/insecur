# ADR-0084: Runtime-Only Restore Import Boundary

Date: 2026-07-09

Status: Accepted

## Decision

The restore importer required by [ADR-0058](0058-minimal-backup-and-tested-restore.md) and
[ADR-0072](0072-backup-export-pipeline-and-freshness.md) runs **inside the Runtime deploy**
(`apps/runtime`, `insecur-runtime`), behind a **dedicated restore-only `WorkerEntrypoint`**
exported by that same deploy. There is no second key-bearing backup or restore Worker, ever.

The forcing constraint is the same one that pinned the export venue in ADR-0072: the artifact is
sealed under the instance custody chain, and the root key is resolvable only inside the Runtime
Worker through the Cloudflare Secrets Store binding
([ADR-0028](0028-instance-secrets-in-secrets-store-with-escrow.md),
[ADR-0064](0064-minimize-secret-resident-surface.md)). An importer that opens the sealed envelope
must unwrap the export DEK under the root key, so the importer must live where the root key lives.
The product-spec §2 topology invariant (exactly one deploy declares `INSTANCE_ROOT_KEY_V1`, and it
serves zero public routes) therefore fixes the venue: `apps/runtime` remains the sole holder of
`INSTANCE_ROOT_KEY_V1` for backup **and** restore, scheduled backup export stays in Runtime
(ADR-0072), and restore import joins it in the same deploy.

**The restore entrypoint.** The Runtime deploy exports a second `WorkerEntrypoint`,
`RuntimeRestoreService`, separate from the normal `RuntimeService` entrypoint that serves API/Web
traffic. Cloudflare Service Bindings select an entrypoint per binding, so reachability is
structural: the API and Web Workers bind only `RuntimeService` and **must not gain a binding to
`RuntimeRestoreService`**; no product code path can invoke a restore. The restore entrypoint
exposes no decrypt-and-return API of any kind — it opens the sealed envelope, verifies it, and
writes rows; Sensitive Value ciphertext and wrapped data keys are copied exactly as stored, never
decrypted during import. Post-import canary verification goes through the normal `RuntimeService`
decrypt path, not through the restore entrypoint.

**Operator trigger and coordinator boundary.** The restore entrypoint is reachable only over a
private Service Binding, so the trigger is an **operator-deployed coordinator Worker** provisioned
for the restore window: it declares a single Service Binding to `insecur-runtime` with
`entrypoint: RuntimeRestoreService`, and the operator invokes it directly (manual dispatch or an
operator-only endpoint gated by Cloudflare account access, which is operator surface, not product
surface). The coordinator's authentication anchor is Cloudflare account deploy authority — the
same accepted property ADR-0028 records for the root key itself. The coordinator holds **no root
key, no Secrets Store binding, no Hyperdrive binding, and no decrypt API**, and serves **no public
product route**; it may sequence steps and relay metadata only. A coordinator that acquires any of
those capabilities is the second key holder this decision forbids. The coordinator is torn down
with the restore window; it is not a standing deploy and is never added to the checked-in fleet.

**Arming: the `RESTORE_DB` binding lifecycle.** Restore import writes to the fresh Neon target
over a **temporary `RESTORE_DB` Hyperdrive binding** added to the Runtime deploy for the restore
window only. The binding is never committed to `apps/runtime/wrangler.jsonc`: the operator applies
it as a deploy-time config change when the drill or recovery starts and removes it immediately
after canary verification and evidence capture. The binding's presence is the arming switch — when
`RESTORE_DB` is absent (every normal deploy), any call to the restore entrypoint fails closed with
a metadata-only `restore_not_armed` error. The normal `DB` binding and live-tenant traffic are
untouched; import statements run only against `RESTORE_DB`.

**Instance and organization scope.** A restore call names the artifact (`artifact_ref`), the
expected `instance_id`, and the expected `root_key_version`. The importer verifies artifact
authenticity before writing anything: the header `format_marker` must match the known envelope
format, the header `instance_id` must equal the deploy's own `INSTANCE_ID`, the header
`root_key_version` must resolve to a bound root-key version, and the export-DEK unwrap plus
AES-256-GCM open must succeed under the ADR-0072 AAD (instance ID and export timestamp).
Authenticity rests on the AEAD under the escrowed root key: a foreign, tampered, or re-enveloped
artifact fails to open and the import fails closed with no rows written. Row writes follow the
export's scope shape in reverse under the same forced-RLS posture
([ADR-0037](0037-tenant-scoped-bound-store-over-rls.md)): instance-scope rows in an `app.service`
transaction, and each organization's rows in that organization's own scoped transaction.

**Fresh-target proof.** Before the first row is written, the importer proves over `RESTORE_DB`
that the target is a fresh, migrated, empty database: schema migrations are applied, the
`instance_identity_configurations` table is empty, and zero organizations exist. A non-empty
target — including the live database, a previously imported target, or a partially imported
target — fails closed with `restore_target_not_fresh` and no writes. This is what makes restore
import replay-safe by construction: an artifact may be imported any number of times, but each
import lands in its own fresh target; the same target can never be imported into twice.

**Atomicity, concurrency, and failure cleanup.** The importer first writes an instance-scope
import-journal marker recording `artifact_ref`, the source export operation ID, and the start
time; a concurrent or repeated invocation observes the marker (or the advisory lock guarding it)
and fails closed — at most one import per target, ever. Each organization then imports atomically
in one transaction: an organization is fully present or fully absent, never torn. Any failure —
authenticity, fresh-target, journal conflict, or a mid-run transaction error — fails the whole
import: the run ends `failed`, the operator **discards the entire Neon target** and retries with a
new fresh project (the existing runbook recovery step), and the `RESTORE_DB` binding is removed if
the window is being abandoned. A partially imported target is never repaired in place and never
serves traffic.

**Audit and observability.** Each import runs as an Operation with intent code
`backup.restore_import` (registered in the `packages/operations` intent-code catalog per
[ADR-0068](0068-stable-dotted-code-vocabularies-in-canonical-catalogs.md)), recorded in the restore target under the
recovery-canary sentinel organization exactly as ADR-0072 records export Operations. As the final
step of a successful import — after the canary organization's rows exist in the target — the
importer writes a `backup.restore_import_succeeded` audit event under that scope; a failed run
emits `backup.restore_import_failed` through the [ADR-0030](0030-hybrid-allowlisted-telemetry.md)
allowlisted telemetry sink and into the drill evidence (a discarded target keeps no rows, so the
failure record lives outside it). The ADR-0058 drill-level codes
(`backup.restore_drill_succeeded` / `backup.restore_drill_failed`) are unchanged and sit above
these import-level codes. All records are metadata-only: scope IDs, operation IDs, timestamps,
counts, and status — never row payloads, ciphertext, or canary plaintext.

**Conformance expectations.** The deploy-topology conformance gate
(`scripts/ci/deploy-topology-conformance.mjs`, INS-199) already asserts the invariants this
decision leans on: exactly one deploy declares `INSTANCE_ROOT_KEY_V1` with zero public routes, and
the API Worker's only Service Binding targets `insecur-runtime` with `entrypoint: RuntimeService`.
The restore implementation (INS-565) extends the gate to also fail when any checked-in deploy
config declares a `RESTORE_DB` Hyperdrive binding (the standing fleet has exactly one DB path) or
a Service Binding with `entrypoint: RuntimeRestoreService` (only a window-scoped operator
coordinator may hold one, and it is never checked in). The route inventory is unchanged: the
restore entrypoint adds zero public routes, and `docs/specs/deploy-route-inventory.md` continues
to require zero `/v1/*` routes on the Runtime deploy.

## Options Considered

- **A dedicated restore Worker holding its own root-key binding.** Rejected. It is a second
  key-bearing deploy: two isolates can decrypt, the product-spec §2 "exactly one deploy declares
  `INSTANCE_ROOT_KEY_V1`" invariant breaks, and every argument in
  [ADR-0077](0077-capability-isolated-worker-deploys.md) for shrinking the decrypt blast radius
  applies against it. ADR-0028's Secrets Store ACL model makes it worse, not better: binding is
  gated only by account role, so a standing second key-bearing Worker is a standing second
  extraction path.
- **An operator-machine importer holding the target `DATABASE_URL` directly.** Rejected. Opening
  the sealed envelope outside the Worker requires root-key material leaving the Worker — the hard
  violation ADR-0028/ADR-0064 forbid and the exact reason ADR-0072 pinned the export venue.
  Shipping the sealed artifact plus an escrowed key to a laptop reintroduces the plaintext-key-on-
  operator-hardware surface the escrow ceremony deliberately confines to the load ceremony.
- **A restore method on the existing `RuntimeService` entrypoint.** Rejected. Everything on
  `RuntimeService` is reachable by the API and Web deploys over their standing bindings, so a
  compromised public edge could aim an import at a database. A separate entrypoint makes
  non-reachability structural (the binding's `entrypoint` selection), consistent with ADR-0077's
  rule that capability isolation is topology, not a code conditional.
- **A standing `RESTORE_DB` binding kept in the checked-in config.** Rejected. A permanent second
  database path from the key-holding deploy is standing attack surface serving no standing
  purpose; restores are rare operator ceremonies. Window-scoped arming also gives the fail-closed
  `restore_not_armed` default for free.

## Consequences

- INS-565 implements the importer to this shape: `RuntimeRestoreService` in `apps/runtime`, the
  `backup.restore_import` intent code, the two audit codes, the fresh-target and journal guards,
  and the conformance-gate extensions named above.
- The "Neon Postgres restore from encrypted backup" runbook
  ([docs/runbooks/neon-postgres-restore-from-encrypted-backup.md](../runbooks/neon-postgres-restore-from-encrypted-backup.md))
  owns the operator steps and now names this venue: its import step stops describing the execution
  venue as undecided, and its recovery section carries the discard-and-reprovision plus
  `RESTORE_DB` teardown steps.
- `apps/runtime/CONTEXT.md` and `packages/backup-restore/CONTEXT.md` point here; the package keeps
  owning envelope validation and evidence shapes while import **execution** is Runtime-owned, the
  same split ADR-0072 uses for export.
- The restore drill (ADR-0058) now exercises the real importer end to end — the same entrypoint,
  arming lifecycle, and audit path a real Neon-loss recovery would use, which is the point of the
  drill.
- The loss limit and custody model are unchanged: one custody chain, no separate backup key
  (ADR-0058), escrow still the only recovery for root-key loss (ADR-0028).

Trace: [product-spec.md §2](../specs/product-spec.md),
[ADR-0028](0028-instance-secrets-in-secrets-store-with-escrow.md),
[ADR-0037](0037-tenant-scoped-bound-store-over-rls.md),
[ADR-0058](0058-minimal-backup-and-tested-restore.md),
[ADR-0064](0064-minimize-secret-resident-surface.md),
[ADR-0072](0072-backup-export-pipeline-and-freshness.md),
[ADR-0077](0077-capability-isolated-worker-deploys.md),
[docs/specs/deploy-route-inventory.md](../specs/deploy-route-inventory.md).
