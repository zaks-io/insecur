# Runbook: Instance Root Key Bootstrap (Generate, Escrow, Load)

Concrete Security Runbook following the interface in
[../security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).
Implements the bootstrap ceremony required by
[ADR-0028](../adr/0028-instance-secrets-in-secrets-store-with-escrow.md) and the
resident-surface rules in
[ADR-0064](../adr/0064-minimize-secret-resident-surface.md). Satisfies tickets
INS-146 (escrow) and INS-145 (Secrets Store bind).

This runbook handles real root-key material. It is **HITL, human-only**. No agent
executes or simulates it. The key is never committed, logged, echoed into a
transcript, or stored as a `wrangler secret`.

## purpose

Bring an Instance's root key into existence safely: generate it offline, record a
sealed escrow copy **before** it becomes unreadable, then load it into Cloudflare
Secrets Store so the deployed Worker resolves it at runtime through the existing
`SecretsStoreRootKeyProvider`. This is the one-time bootstrap, not rotation
(rotation has its own catalog entry).

## when_to_use

- **Triggers:** standing up a new Instance (`-dev` first, then each environment)
  that has no instance root key yet; a Self-Hosted Instance operator bootstrapping
  their own root key.
- **Non-triggers:** rotating an existing root key (use the Root Key Rotation
  runbook — it generates the new version offline, escrows it, loads it into
  Secrets Store, rewraps data keys, then retires the old version). Re-running
  this against an Instance that already has a bound, escrowed root key.

## scope

One Instance, one environment, one root key version. The `-dev` Instance is done
first and proves the procedure before any environment that holds valuable
secrets.

## required_authority

- Offline generation: physical control of a trusted machine.
- Escrow: write access to the operator's external password manager vault (1Password).
- Cloudflare load + bind: Cloudflare account role **Super Administrator** or
  **Secrets Store Deployer/Admin** (ADR-0028 — binding is gated by account role,
  there is no per-secret ACL).

## preconditions

- The escrow target is **external to insecur** (a 1Password vault item). insecur
  cannot custody its own root key — it needs the root to decrypt anything, so the
  authoritative recovery copy lives outside the system.
- A 1Password vault exists for instance custody material, with its own access log
  (1Password item/vault audit) serving as the out-of-band access record ADR-0028
  requires.
- `apps/runtime/wrangler.jsonc` is ready to declare a Secrets Store binding for
  `INSTANCE_ROOT_KEY_V1` (see `execute`). The binding lives ONLY on the private Runtime
  Worker (`insecur-runtime`); the public API Worker (`apps/api`) must never declare it
  (ADR-0077; enforced by `pnpm conformance:topology`). Each root key version is its own named
  Secrets Store secret and binding
  ([ADR-0028](../adr/0028-instance-secrets-in-secrets-store-with-escrow.md) 2026-06-12 amendment).
- The generating machine is trusted and can be taken offline during generation.

## safe_inputs

The only Sensitive Value in this runbook is the root key itself. It enters in
exactly three places and nowhere else:

1. The offline generation command's stdout (transient, on the trusted machine).
2. The 1Password vault item (sealed escrow copy).
3. The Cloudflare Secrets Store value field (write-only after creation).

It must never enter: a shell history file, a committed file, a `wrangler secret`,
a `.env`, a log, an agent transcript, or any insecur-controlled store.

## dry_run

Preview without producing key material:

- Confirm the key format the runtime requires: **exactly 64 lowercase/uppercase
  hex characters = 32 bytes**, validated by `parseInstanceRootKeyHex`
  (`packages/crypto/src/root-key-material.ts`). Anything else fails closed with
  `RootKeyNotConfiguredError`.
- Confirm the root key version matches `DEFAULT_ROOT_KEY_VERSION`
  (`packages/crypto/src/constants.ts`) — now the current wrap version, not the
  only valid version; unwrap resolves the binding named by the recorded
  `root_key_version` and fails closed when it is unbound
  ([ADR-0028](../adr/0028-instance-secrets-in-secrets-store-with-escrow.md) 2026-06-12 amendment).
- Run `pnpm build` to confirm the Worker dry-run deploy passes **before** adding
  the binding, so any later failure is attributable to the binding.

## execute

Order is load-bearing: **generate → escrow → load**. Escrow comes before the
Cloudflare load because Secrets Store is write-only after creation; once loaded
you cannot read the value back to escrow it (ADR-0028).

1. **Go offline.** Disable networking on the trusted machine for the generation
   and escrow steps.

2. **Generate** a 32-byte key as 64 hex chars. Either:
   - `openssl rand -hex 32`, or
   - `node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"`

   Use **hex**, never base64. `randomBytes(32).toString('base64')` produces a
   44-char value that `parseInstanceRootKeyHex` rejects at runtime with
   `RootKeyNotConfiguredError` — and Secrets Store is write-only, so the mistake is
   invisible until the first encrypt fails. (This is exactly how the preview key was
   mis-bootstrapped.)

   Do not redirect it to a file. Do not let it land in shell history (use a shell
   that does not persist this command, or clear history for the session). Keep it
   in the terminal scrollback only as long as steps 3 and 4 need.

3. **Escrow first.** Create a new 1Password vault item in the instance-custody
   vault. Store the hex string. Record metadata in the item: instance ID, root key
   version (matching `DEFAULT_ROOT_KEY_VERSION`), created date, environment
   (`-dev`), and a note that this is the authoritative offline escrow copy. The
   1Password access log is the out-of-band access record. This is the INS-146
   deliverable — `custodyEvidenceRef` resolves to this real record, not a fixture
   string.

4. **Load into Cloudflare Secrets Store.** Create the Secrets Store secret for the
   `-dev` Instance and paste the same hex value. After creation it is write-only.

5. **Declare the binding.** In `apps/runtime/wrangler.jsonc` (the private Runtime Worker —
   NOT the public API Worker), add the Secrets Store binding that populates
   `env.INSTANCE_ROOT_KEY_V1` for `-dev` — one Secrets Store
   secret per root key version per the
   [ADR-0028](../adr/0028-instance-secrets-in-secrets-store-with-escrow.md)
   2026-06-12 amendment. Commit the binding declaration (which contains no key
   material — only the store/secret reference).

6. **Clear the terminal.** Close the scrollback / clear the screen so the key is
   not left resident in the terminal buffer.

## verify

Verify against **cloud `-dev`, not localhost** — localhost cannot exercise Secrets Store bindings,
so binding and key-material verification must run against the deployed `-dev` Worker:

- **Exercise a real encrypt against the deployed `-dev` Worker** (e.g. the First
  Value smoke's secret-write step, or any route that reaches the keyring). A
  malformed value (wrong length, base64 instead of hex) only surfaces here: the
  binding `.get()` succeeds and returns the bad string, then
  `parseInstanceRootKeyHex` fails closed with `RootKeyNotConfiguredError`. Loading
  succeeding and the binding listing as `active` is **not** proof the value is valid.
- `wrangler --remote` confirms the deployed `-dev` Worker resolves the root key
  through `SecretsStoreRootKeyProvider` (a path that needs the root key succeeds;
  it does not echo the key).
- `pnpm build` (Worker dry-run deploy) still passes with the binding declared.
- A deliberate version-mismatch probe fails closed with `RootKeyNotConfiguredError`.
- In production builds, confirm the `INSECUR_INSTANCE_ROOT_KEY_HEX` env fallback is
  **refused** (ADR-0064) — the Secrets Store binding is the only accepted source.
- Confirm no key material appears in `git log`, `wrangler` output, CI logs, or this
  runbook's execution notes.

## expected_audit

Bootstrap predates most in-app audit, so evidence is operational, metadata-only:

- 1Password item creation timestamp + access log entry (the escrow evidence record).
- Cloudflare Secrets Store secret creation event in the account audit log.
- Git commit adding the `wrangler.jsonc` binding (no key material in the diff).
- An entry in the Security Evidence Bundle referencing the above by ID, never by value.

## recovery

- **Generation interrupted before escrow:** discard the key, regenerate. Nothing
  was loaded, nothing to clean up.
- **Loaded to Cloudflare but escrow failed/incomplete:** the value is now
  unreadable from Secrets Store. Treat as a failed ceremony — generate a fresh
  key and restart from step 1; do not try to recover the loaded value.
- **Suspected exposure of the key (history, log, screen-share):** treat as
  compromise. For exposure where extraction may have occurred, escalate to the
  [Custody-Material Compromise runbook](custody-material-compromise.md) — rotation
  alone is insufficient when the old root plus a database dump may be in an
  attacker's hands, so containment also requires Cloudflare reset and
  tenant-driven upstream rotation. For `-dev` pre-launch with no valuable secrets,
  regenerate and re-bootstrap.
- **Lost Cloudflare store / account:** restore from the 1Password escrow copy by
  loading it into a fresh Secrets Store secret. This is the single-point-of-loss
  protection escrow exists for.

## customer_communication

None for the `-dev` Instance (no tenants, pre-launch). For a future Instance that
holds tenant secrets, root-key bootstrap is internal custody and is not a
tenant-facing notification event on its own.

## evidence

Attach to the Security Evidence Bundle (`storage.*` / `backup_restore.*` control
groups), all metadata-only:

- Escrow record reference (1Password item ID + created timestamp).
- Root key version.
- Cloudflare Secrets Store secret creation event ID.
- `wrangler.jsonc` binding commit SHA.
- `wrangler --remote` resolution verification result.
- Production env-fallback-refused confirmation (ADR-0064).
