# Project And Secret Lifecycle

Glossary slice for agents. Term definitions are authoritative here and single-sourced;
do not copy them into package context files. Index and routing: [`../../../CONTEXT.md`](../../../CONTEXT.md).
Term relationships: [`../relationships.md`](../relationships.md). Usage examples: [`../dialogue.md`](../dialogue.md).

## Project And Secret Lifecycle

**Project**:
A logical application or service whose secrets are managed together inside an organization.
_Avoid_: app, service when the managed secret boundary is meant

**Environment**:
A named deployment context inside a project, such as development, preview, staging, or production.
_Avoid_: stage, target when the project environment is meant

**Variable Key**:
The application-facing key used when a Secret is delivered as an environment variable or as the default provider-side variable name, such as `DATABASE_URL`. V1 Variable Keys are ASCII uppercase env-var-safe strings matching `^[A-Z_][A-Z0-9_]*$`.
_Avoid_: Display Name, Opaque Resource ID, Runtime Policy Key, cryptographic key, env var name / environment variable key, normalize env var names; parsed keys must not be silently converted, explicit Variable Key Prefix applied before validation not as normalization

**Variable Key Prefix**:
An optional ASCII uppercase env-var-safe string prepended to parsed import keys before Import Preflight validates and de-duplicates the resulting Variable Keys.
_Avoid_: normalization, namespace when the exact delivered key prefix is meant, prefix-normalized key; prefixes applied before Import Preflight, final Variable Key must be valid as written

**Secret**:
An Environment-scoped managed key-value slot for one Secret Shape. Its delivered key is the Secret Shape's **Variable Key**, and its value is the selected **Secret Version**.
_Avoid_: config, Display Name, JSON/structured value when the single-string V1 shape is meant

**Sensitive Value**:
Plaintext material that can directly authenticate, decrypt, authorize secret delivery, or reveal a managed secret.
_Avoid_: actual secret, secret when the broader protected plaintext category is meant, actual secret for protected plaintext beyond managed Secret values

**Text Secret Value**:
A V1 Secret Version Sensitive Value represented as one valid UTF-8 string, not arbitrary binary data.
_Avoid_: binary secret, best-effort decoded secret, structured secret / JSON secret / multi-field secret not used for V1; a Secret value is a Text Secret Value, structured values are a deferred additive type, binary secret not used for V1 managed Secrets; store caller-encoded text as a Text Secret Value when binary credential material must be represented

**Secret Value Size Limit**:
The V1 maximum allowed size of a Text Secret Value: 64 KiB measured in encoded UTF-8 bytes rather than characters.
_Avoid_: character limit, provider-wide smallest cap, character limit not used for V1 managed Secret values; measured in encoded UTF-8 bytes

**Provider Value Size Limit**:
A destination-specific maximum value size enforced by a provider sync target for one bound provider-side secret or variable.
_Avoid_: insecur storage limit, global provider limit, fits every provider not used for the 64 KiB Secret Value Size Limit; use Provider Value Size Limit for destination-specific sync caps

**All-Or-Nothing Sync Pre-Write Gate**:
The Secret Sync rule that a deterministic pre-write failure on any exact binding blocks every provider write in that sync run before the first provider write starts.
_Avoid_: best-effort sync, partial sync when a pre-write check fails

**Protected Promotion Sync Preflight**:
The provider-size eligibility check that blocks protected Promotion when an enabled affected Secret Sync would reject a promoted value.
_Avoid_: publish first and let the immediate sync fail

**Automatic Provider Value Transform**:
Any Secret Sync behavior that changes a Text Secret Value to fit a provider destination, such as compression, truncation, chunking, implicit base64 encoding, or other automatic re-encoding.
_Avoid_: convenience encoding, provider fit shim, auto-compress / auto-truncate / chunk the secret / auto-encode for provider sync are forbidden

**Secret Shape**:
An Insecur-specific term for the project-level non-secret definition of one application-facing secret variable, including its **Variable Key**, optional Display Name, description, required status, and generation hint.
_Avoid_: default when referring only to metadata, secret schema when the product term is needed, stored secret value, default production variable is unsafe; use Secret Shape for shared metadata and Environment Default for a non-protected environment value, promote variables to staging or production / move variables between environments is Secret Shape propagation across Environments (no Sensitive Value); reserve Promotion for within-Protected Environment Draft to Published step

**Environment Default**:
A non-protected environment value intended for local or development delivery.
_Avoid_: production default

**Shared Secret Source**:
A single secret value explicitly attached to multiple environments.
_Avoid_: inherited secret, copied secret, shared secret means Shared Secret Source, not environment inheritance or a copied value

**Secret Version**:
An immutable historical value for a secret.
_Avoid_: revision

**Secret Version Store**:
The plaintext-free Module that owns per-Secret version chains, Current Version selection, Draft Version storage, Published Version selection, Rollback, Draft Version Discard, and atomic publish of exact versions while accepting and returning wrapped material only.
_Avoid_: approval service, encryption engine, secret table when the lifecycle Interface is meant

**Blind Secret Write**:
A secret write that creates a Secret Version without returning the Sensitive Value to the caller.
_Avoid_: blind secret when implying a separate Secret type, blind secret when the write flow is meant; a blind write still creates a normal Secret Version, stage a secret when a value is written without reveal (vs Draft Version when the stored version is meant)

**Metadata Receipt**:
The metadata-only confirmation returned to the actor after a **Blind Secret Write**: new Secret Version identity, target Environments, and timestamp, with nothing derived from the Sensitive Value.
_Avoid_: checksum, fingerprint, last-4, value preview; any value-derived confirmation artifact is a reveal channel, write confirmation when the metadata-only guarantee is the point

**Draft Version**:
An immutable secret version that is stored but not eligible for protected delivery.
_Avoid_: staged value when the immutable version is meant

**Draft Area**:
The set of unpromoted Draft Versions available for review in one Protected Environment.
_Avoid_: staging environment when this is not a separate Environment, staging area for unpromoted Draft Versions in one Protected Environment

**Draft Version Discard**:
A terminal lifecycle action that removes an unpromoted **Draft Version** from the **Draft Area** so it cannot be selected for **Promotion**.
_Avoid_: delete secret when the protected value remains governed by audit/retention rules, delete draft secret when removing an unpromoted Draft Version from the Draft Area without revealing its Sensitive Value, restore discarded draft; a discarded Draft Version is terminal, same value requires a new Blind Secret Write and Draft Version, retain discarded draft value; V1 crypto-erases encrypted Sensitive Value immediately, retains tombstone/audit metadata only, approve discard; requires Destructive Confirmation, not an Approval Request or High-Assurance Challenge, discard without impact; human Destructive Confirmation shows metadata-only impact before execution, stale discard confirmation; human discard requires refreshed metadata-only impact and fresh Destructive Confirmation when impact or access changes, discard approval; discarding closes affected pending Approval Requests without approving or rejecting them

**Draft Version Reuse**:
Including an existing unpromoted **Draft Version** in a fresh **Promotion Change Set** after an earlier **Approval Request** closed without **Promotion**.
_Avoid_: approval reuse, carry over approval

**Published Version**:
The secret version selected for delivery from a protected environment.
_Avoid_: current when protected delivery status is meant, published when referring to protected delivery eligibility

**Retained Published Version**:
A prior **Published Version** kept encrypted and **Rollback**-eligible within the **Rollback Retention Window**. Eligibility is evaluated lazily at rollback request; an expired version is ineligible but its ciphertext is retained, not crypto-erased, in V1, per [ADR-0076](../../adr/0076-lazy-lifecycle-expiry-and-retained-version-disposal.md).
_Avoid_: backup when no plaintext copy is kept, current version or published version when it is no longer the live version

**Current Version**:
The selected secret version for a secret.
_Avoid_: latest when the selected version is meant

**Secret Source of Truth**:
The selected secret value stored in insecur for a project environment.
_Avoid_: provider secret when the canonical value is meant, single source of truth for insecur's canonical value for sync and delivery
