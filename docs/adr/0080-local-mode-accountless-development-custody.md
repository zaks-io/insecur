# ADR-0080: Local Mode Is An Account-Less V1 Development Custody Mode

Date: 2026-07-04

Status: Accepted

## Decision

insecur ships **Local Mode** in V1 as its own milestone: account-less CLI operation where
non-protected development Secrets are stored encrypted on the developer's machine and used through
the ordinary `init` / `secrets set` / `run` command surface, with no Hosted Instance account. An
unauthenticated `insecur init` defaults to Local Mode with a one-line notice; the CLI-first
account-less path becomes the top of the acquisition funnel.

Local Mode's security claim is bounded and stated plainly: it keeps development secrets out of
casual agent reach (repo files, shell history, terminal output, agent transcripts). It is
explicitly not no-reveal custody, because a machine cannot enforce a boundary against processes
running as the same OS user. It sits below the development tier of the two-tier boundary
(threat-model §2.5): the dev-tier ergonomics without the off-box store, revocable grants, or
tamper-resistant audit. "Your laptop cannot keep a secret from your own agents; custody means the
store is somewhere the agent isn't" is the canonical upgrade pitch, never a defensive FAQ answer.

The value ladder is deliberate: solving cooperative agents accidentally reading development
secrets is free and local; tighter control (off-box custody, audit, attribution, revocation,
sync, Teams, Protected Environments) is the paid, logged-in product.

Structural decisions:

- **Same commands, real seams.** Local Mode is not a parallel command set or a second secret
  model. A local store implements the same contract seams (Secret Version Store, Injection Grant,
  audit writer) and the same encryption envelope, key-version, and ciphertext identity binding
  machinery, with a narrower key hierarchy. Per-project selection is the existing `host` field in
  the committed project config (`"host": "local"`).
- **Single-seat, machine-scoped domain.** Projects and non-protected development Environments
  exist locally with client-minted Opaque Resource IDs. Organization, User, Team, Membership,
  Protected Environments, Secret Sync, machine access, and production delivery never exist in
  Local Mode; the protected posture is structurally inexpressible locally.
- **Key custody without native dependencies.** The machine-local root key lives in the OS
  keychain reached by shelling out to OS-shipped tooling (`security` on macOS, PowerShell DPAPI
  on Windows, `secret-tool` on Linux where present), behind one `KeyStore` seam, with a documented
  `0600` key-file fallback. No bundled keychain libraries. Keychain placement buys key/ciphertext
  separation so a synced or backed-up `~/.insecur/` is ciphertext only.
- **The local store holds Current Versions only.** No local version history; rotation history and
  rollback are logged-in features.
- **Login never touches local data.** Migration is an explicit, per-project, human-confirmed
  command (`--yes` cannot satisfy its confirmation). It is a reconcile state machine: create
  missing remote resources by replaying client-minted IDs; report `already in sync` when values
  match; fail loud with a stable error and remediation when remote values diverge; never
  overwrite or delete remote state. Equality is a server-side possession check (candidate value
  in, metadata-only verdict out); raw digests and string-similarity metrics are prohibited as
  offline-cracking and incremental-extraction oracles. Cleanup is verified-then-clean: local
  copies are removed only after every value is proven present remotely, then the project config
  flips to the cloud host; every failure path leaves local state intact and the command
  re-runnable. Migration is one-way; a cloud-to-local path is a reveal path and never exists.
- **Coexistence forever.** A machine may hold local and cloud projects side by side indefinitely.
  Upgrade pressure is the feature ceiling, not coercion or a time limit.
- **The committed project config is the secret manifest.** In Local Mode the committed config
  owns the project's Secret Shapes (non-secret by definition), so a fresh clone can auto-adopt
  the project (development Environment by default) and report exactly which Variable Keys lack
  values on this machine with the exact commands to fill them. After migration the server owns
  the shapes, like any cloud project.
- **Agent-legible boundaries.** Every capability outside the Local Mode ceiling fails with a
  stable error code and a remediation object stating what Local Mode cannot do and the exact
  upgrade commands, extending the existing remediation-envelope contract.
- **Write-time descriptive verdicts.** Metadata-only facts computed at write time (byte length,
  encoding class, emptiness, leading/trailing whitespace, placeholder heuristics, Secret Shape
  match verdict) let agents validate secrets without a decrypt path; each exposed field goes
  through the Plaintext Metadata Allowlist registry (ADR-0070). This applies to both Local Mode
  and hosted storage.

## Options Considered

- **No local mode; keep login-first onboarding only.** Rejected. The beachhead is agent-heavy
  solo developers, and the account wall plus "why do I have to upload my secrets?" objection is
  the exact friction that loses them before first value.
- **Anonymous auto-provisioned cloud tenants (no local store).** Rejected. Keeps one custody
  model but does not answer the upload objection at all, creates an abuse surface of ownerless
  tenants, and has no recovery story for a lost anonymous credential.
- **Local Mode as a permanent trust posture with the full feature set.** Rejected. Defending
  no-reveal claims on hardware we do not control is impossible, and it converts the product into
  a nicer dotenvx. The feature ceiling is the load-bearing boundary.
- **Passphrase-derived or daemon-held local keys.** Rejected. Both buy friction to partially
  mitigate the same-user adversarial process, a threat Local Mode explicitly disclaims, and
  passphrases block unattended agent use entirely.
- **Local backup/export of the local store.** Rejected. A backup command is an export path; local
  durability is deliberately absent and documented, and cloud migration is the durability story.

## Consequences

- `docs/first-value-milestone.md`'s exclusion of "a dev-only database, file store, ... or
  alternate Secret model" needs amendment: the ban on shortcut scaffolding stands, and Local Mode
  is defined as a first-class custody backend behind the same seams, not scaffolding.
- `docs/phasing.md` gains Local Mode as its own V1 milestone after First Value, useful standalone.
- `docs/whitepaper/threat-model.md` §2.5 gains the Local Mode tier and its claim boundary;
  `docs/specs/product-spec.md` and `docs/cli-and-sync.md` gain the mode, the migrate command
  semantics, the unauthenticated-`init` default, and the manifest role of the project config.
- The glossary owns the term (`docs/context/glossary/instance-onboarding.md`, **Local Mode**).
- CLI Profiles must be allowed to select a local project (no `orgId`); the migrate confirmation
  joins the scoped confirmations `--yes` cannot satisfy.
- Distribution must provide a stable install path on macOS so keychain ACL prompts do not
  re-trigger per run (ephemeral `npx` binaries are not the recommended first-touch there).
- Pricing/marketing inherit the ladder: casual-read protection for development secrets is free
  and local; control is the upgrade. Some users will camp on Local Mode forever; accepted, since
  they were never uploading anyway and they carry the CLI into teams that will.
