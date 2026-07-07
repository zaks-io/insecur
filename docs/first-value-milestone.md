# First Value Milestone

The First Value Milestone is the integration contract for provider-free Diskless Development Secret
Use in one non-protected development Environment. It is not a separate product mode. Its Interface
is the ordinary product path an admitted User uses to provision a Personal Organization, create or
generate a development Secret through a Blind Secret Write, and run one local command through
Runtime Injection without receiving the Sensitive Value in CLI/API output.

The Module exists because the first implementation slice is allowed to be small, but not allowed to
invent unsafe scaffolding. If onboarding, authorization, storage, encryption, secret versioning, CLI
output, and runtime injection are implemented as local shortcuts first, the real product reappears
as a rewrite. The leverage is one thin vertical contract that proves product value while forcing the
same seams Production Delivery will later use.

## Scope

The First Value Milestone owns the integration of:

- Guided Organization Provisioning for a Personal Organization.
- Default Team and owner Membership creation for the admitted User.
- First Project and non-protected development Environment creation.
- Non-secret local project configuration that stores Opaque Resource IDs only.
- Non-protected `secrets set --variable-key` create-or-update through a Blind Secret Write.
- Service-generated Sensitive Values for the First Value Proof.
- Direct non-protected `run --variable-key` Runtime Injection for one command.
- Metadata-only human and JSON output for every step.

The milestone does not own:

- Shortcut scaffolding: a dev-only database, file store, auth bypass, local plaintext cache, or
  alternate Secret model invented outside the real product seams.
- **Local Mode** ([ADR-0080](adr/0080-local-mode-accountless-development-custody.md)): account-less,
  machine-scoped development custody is a first-class backend behind the same Secret Version Store,
  Injection Grant, and audit seams, but it is out of scope for First Value. First Value proves the
  hosted Diskless Development Secret Use path through Guided Organization Provisioning; Local Mode is
  a separate V1 milestone with its own spec in `docs/cli-and-sync.md`.
- Provider App Connections, Secret Sync, provider lookup, or provider credentials.
- Protected Environments, Promotion, Approval Requests, or Human Approval Surface flows.
- Machine Identity credentials, GitHub Actions OIDC, or Environment Deploy Keys.
- Production Secret Delivery, production Secret Sync, or the Storage Security Gate.
- Secret Reveal, local plaintext export, provider readback, or `.env` generation.

## Required Seams

The First Value Milestone must use the real seams, even when their implementations are still narrow:

| Seam                            | First Value requirement                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant-Scoped Store             | All persisted tenant metadata and Secret Version metadata go through scoped transactions. No raw executor reaches onboarding, secret write, or CLI command handlers.                                                                                                                                                                               |
| Effective Access Resolver       | The admitted User receives owner Organization Access through Membership and Role, and every route checks Effective Access. No route branches on User type, Role name, or owner shortcut.                                                                                                                                                           |
| Keyring and Encryption Envelope | Stored Secrets are wrapped under tenant-bound keys with ciphertext identity binding. First Value may use a minimal key hierarchy only if it preserves Organization/Project data-key and `key_version` seams.                                                                                                                                       |
| Secret Version Store            | The non-protected write path appends a Secret Version and makes it the Current Version through the store. The store accepts and returns wrapped material only.                                                                                                                                                                                     |
| Runtime Injection Grant Service | Every `run` receives a fresh one-use Injection Grant, even for non-protected development. Direct `--variable-key` selection is a First Value convenience, not a reusable policy bypass. Policy-less `--variable-key` runs use the 300-second First Value default grant lifetime; policy-defined TTL governs once Runtime Injection Policies exist. |
| Audit Event Writer              | Onboarding, Secret write, Injection Grant issue/consume, and denied attempts create tenant-qualified metadata-only audit events.                                                                                                                                                                                                                   |

## Interface

The user-facing Interface should stay ordinary and small:

- Guided Organization Provisioning returns Opaque Resource IDs for the Personal Organization,
  Default Team, owner Membership, first Project, and first non-protected development Environment.
- `insecur init` writes committed local configuration with Opaque Resource IDs only.
- `insecur secrets set --variable-key <KEY> --generate ...` creates or updates one non-protected
  development Secret and returns metadata-only output.
- `insecur run --variable-key <KEY> -- <command>` injects only that exact Secret into the child
  process environment and returns metadata-only command status.
- The copyable First Value Proof uses those same commands, not an onboarding-only command.

All Interface outputs may include Resolved Target Echo, operation IDs, audit IDs, Display Names, and
Variable Keys. They must not include Sensitive Values, child-process environments, command output
captured by insecur, provider responses, decrypted Sensitive Metadata, or local file contents.

## Invariants

- First Value is limited to non-protected development Environments.
- First Value does not accept or encourage production-grade Sensitive Values.
- The First Value path uses the Enterprise-Ready Model where the behavior touches tenant,
  membership, authorization, audit, key, and Secret Version state.
- A Secret created in First Value is still a normal Secret with a Secret Shape, Secret Version, and
  Current Version.
- Runtime Injection injects only the exact requested Variable Key for the one command.
- The child process can read the injected value after the Runtime Trust Boundary; the product claim
  is delivery without reveal in caller output, not compromise-proof local execution.
- Secret Import, if present in the same slice, is a one-way non-protected development adoption
  helper and does not create Runtime Injection Policies, Secret Syncs, or CLI Profiles.
- The Storage Security Gate does not block this local development loop, but tenant-bound encryption,
  Secret-Free Logging, No Plaintext Persistence, and cross-tenant authorization still apply.

## Test And Release Evidence

The Interface is the test surface:

- Provisioning tests prove one admitted User receives a Personal Organization, Default Team, owner
  Membership, first Project, and non-protected development Environment without first naming every
  object.
- Authorization tests prove the generated owner Membership resolves through the Effective Access
  Resolver and that a User outside the Organization cannot use guessed Opaque Resource IDs.
- Storage tests prove onboarding, Secret metadata, and Secret Version metadata use the
  Tenant-Scoped Store under the runtime role.
- Encryption tests prove the generated development Sensitive Value persists only as wrapped
  material with tenant/resource identity binding and key-version metadata.
- Secret write tests prove generated and stdin values create Blind Secret Writes with metadata-only
  output, including explicit empty-value behavior and UTF-8/size validation.
- Runtime Injection tests prove only the requested Variable Key is delivered, each run consumes one
  fresh Injection Grant, child stdout/stderr are not captured by insecur, and no Sensitive Value
  appears in CLI, JSON, audit, logs, local config, or operation records.
- First Value Proof tests prove the copyable example succeeds through ordinary `secrets set` and
  `run` commands without provider setup.
