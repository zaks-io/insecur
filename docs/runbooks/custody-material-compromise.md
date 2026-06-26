# Runbook: Custody-Material Compromise (Root Key, Provider Credentials, Cloudflare Account)

Concrete Security Runbook following the interface in
[../security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md). This is the
escalation target [ADR-0059](../adr/0059-tenant-reported-secret-compromise-response.md) hands off
to from tenant-reported compromise triage, together with
[ADR-0048](../adr/0048-breach-forensic-record-separate-from-audit-retention.md) forensic
collection. It is the minimal V1 runbook: containment semantics and manual log-pull guidance,
written so the worst-case incident for a secrets-custody product is not improvised live. The full
detection, SIEM-streaming, and collection-tooling program stays deferred exactly as ADR-0048
decided.

This runbook is **HITL, human-only**. No agent executes or simulates it, and no step in it may
echo key material, Sensitive Values, or suspected leaked values into a transcript or log.

**Containment posture (normative).** Confirmed or assumed extraction of the instance root key
means **all ciphertext encrypted under that root key is treated as exposed**: every Organization
and Project data key is wrapped under the root
([ADR-0028](../adr/0028-instance-secrets-in-secrets-store-with-escrow.md) amendment), so Sensitive
Values, Provider Credentials, and Sensitive Metadata across every tenant of the Instance are in
scope. Containment is three actions together, none sufficient alone: **root key rotation** (the
"root key rotation" entry in the Key management row of the
[Runbook Catalog](../security-runbooks-and-release-gates.md), following ADR-0028's ceremony:
generate offline, escrow first, load, rewrap, retire), **plus Cloudflare credential and role
reset**, **plus tenant notification driving tenant-side rotation of all affected secrets at their
upstream issuers**. Rotation alone is explicitly insufficient: under the wrapped-DEK model, rewrap
changes only the wrapping root version — data-key bytes and record ciphertext are unchanged — so
an attacker holding the old root key plus a prior database dump retains plaintext access to
everything in that dump, and keys recovered from it still decrypt any current ciphertext obtained
later. Nothing cryptographic revokes exposed plaintext; only upstream rotation by tenants does.

## purpose

Contain and respond to compromise of insecur's own custody material: the instance root key,
stored Provider Credentials, or the Cloudflare account (ADR-0059's escalation scope). This is
distinct from a tenant-value compromise, which the tenant-reported triage runbook contains by
publishing a new value and re-syncing; here the custody layer itself is suspect, so the response
covers every tenant of the Instance and the honest admission of what cannot be contained.

## when_to_use

- **Triggers** — any one of the ADR-0059 escalation signals, or direct discovery:
  - Correlated compromise reports from unrelated tenants in a short window.
  - A leaked value matching Sensitive Metadata or a Secret value insecur holds that the tenant
    says it never exposed.
  - Decrypt or access events in the product audit log with no matching authorized operation.
  - A Cloudflare or Secrets Store log anomaly, or escrow access with no matching authorized
    operation — the only place root-key extraction is visible (ADR-0048).
  - Direct discovery: a compromised Cloudflare account credential or API token, an unexpected
    account member or role change, root-key material found in a history, log, screen share, or
    transcript.
- **Non-triggers:** a single tenant's own leaked secret (tenant-reported triage runbook); a single
  Machine Identity credential or single app connection compromise (Machine and provider custody
  runbooks); root-key exposure on a pre-launch `-dev` Instance holding no valuable secrets
  (re-bootstrap per [instance-root-key-bootstrap.md](instance-root-key-bootstrap.md)).

## scope

The whole Instance, not a tenant. Root-key compromise puts every Organization, Project, and
Environment in scope: all ciphertext under the compromised root key version, and any prior
versions the attacker may also hold. A Cloudflare account compromise escalates to root-key scope
by default, because ADR-0028 accepts that deploy/account-privileged access can extract the root
key. Provider-Credential compromise scopes to every app connection whose stored credentials may
have been read, plus the per-Instance provider app client secrets consolidated in Secrets Store
(ADR-0028).

## required_authority

- **Cloudflare account:** Super Administrator — required to reset member credentials and roles,
  revoke API tokens, and manage Secrets Store secrets and bindings (ADR-0028: binding is gated by
  account role).
- **Escrow vault:** admin access to the 1Password instance-custody vault and its access log.
- **insecur:** instance-operator access to the product audit log and signed export
  ([ADR-0045](../adr/0045-asymmetric-signing-for-audit-exports-in-v1.md)).
- An incident lead who owns the timeline and the tenant communication. Human-only; no agent or
  Machine Identity executes any step.

## preconditions

- The Root Key Rotation runbook (Key management catalog row) and its ADR-0028 ceremony are
  executable: a trusted offline machine, escrow vault write access, and Secrets Store access.
- The 1Password escrow vault access log is readable
  ([ADR-0044](../adr/0044-no-reveal-custody-is-a-product-surface-guarantee.md) out-of-band access
  record).
- Cloudflare account audit and Secrets Store logs are accessible for the suspected window.
- The product audit log for the suspected window is within its retention (ADR-0048's durable
  forensic archive is the long-term answer; until it is built, act before the product window
  expires).

## safe_inputs

Triage and forensic collection are metadata-only; no Sensitive Value enters this runbook. The only
new sensitive material is the replacement root key, which is handled entirely inside the Root Key
Rotation ceremony's own safe-input rules (same three places as bootstrap: offline stdout, escrow
item, Secrets Store field — nowhere else). Do not paste a suspected leaked value into any
transcript or tool; signal-2 matching is a manual judgment in V1 because Leak Verification is
deferred (ADR-0059).

## dry_run

Metadata-only preview of blast radius and readiness, before any reset or rotation:

- Enumerate active root key versions and the data-key rows wrapped under each
  (`root_key_version` on the data-key rows) to size the rewrap.
- Confirm the escrow item exists, its metadata matches the bound root key version, and the vault
  access log is readable.
- List Cloudflare account members, roles, API tokens, and Secrets Store bindings; note anything
  unexpected without changing it yet.
- Enumerate exposure scope from metadata only: Organizations, Projects, Environments, app
  connections with stored Provider Credentials, and active Injection Grants.

## execute

Order is load-bearing: lock the account before rotating through it, collect evidence as you go,
notify once scope is known.

1. **Classify.** Determine which custody material is implicated: root key, Provider Credentials,
   Cloudflare account, or escrow. A Cloudflare account compromise is treated as possible root-key
   extraction (ADR-0028); escrow access with no matching authorized operation is treated as
   root-key exposure.
2. **Reset Cloudflare credentials and roles.** Reset or revoke compromised account credentials,
   rotate all API tokens and the deploy principal's credentials (ADR-0044 deploy-principal
   separation), remove unexpected members and role grants, and review Secrets Store bindings for
   additions you did not make.
3. **Rotate the root key** per the Root Key Rotation runbook (Key management catalog row) and the
   ADR-0028 amendment ceremony: generate the new version offline, escrow it first, load it into
   Secrets Store, rewrap every Organization and Project data key from the old version to the new,
   then retire the old version. This stops future use of the extracted root against the live
   store; per the containment posture above it does not, and cannot, contain already-exfiltrated
   ciphertext.
4. **Contain Provider Credentials.** Rotate the per-Instance provider app client secrets in
   Secrets Store. For tenant app connections treated as exposed, disconnect them so providers
   invalidate the stored credentials and tenants reconnect with fresh ones.
5. **Collect the three forensic sources** — manual log pulls per ADR-0048 (the built collection
   and streaming tooling is deferred; a human pulls these by hand):
   - **Product audit log:** tenant-qualified entries plus their signed export (ADR-0045) for the
     suspected window. This scopes which tenants and values are affected for notification.
   - **Cloudflare account and Secrets Store logs:** Worker deploys, Secrets Store binding and role
     changes — the only place root-key extraction is visible.
   - **Escrow-access log:** the 1Password vault and item audit trail for the instance-custody
     vault.
     Preserve integrity-protected copies in the ADR-0048 durable forensic location (R2) or, until
     that archive exists, an offline copy with recorded hashes.
6. **Notify tenants** (see `customer_communication`) instructing rotation of all affected secrets
   at their upstream issuers. This step is the actual containment of exposed plaintext and is not
   optional for a confirmed or assumed root-key extraction.

## verify

- The new root key version is active; every data-key row records the new `root_key_version`; the
  old version is retired and unbound; a product path that needs the root key succeeds.
- Old Cloudflare credentials and API tokens are rejected; the member and role list matches the
  expected roster; Secrets Store bindings match the expected set.
- Rotated provider app client secrets work; disconnected app connections show as disconnected and
  cannot sync.
- Integrity-protected copies of all three forensic sources exist and are referenced by ID.
- Tenant notifications were dispatched to every affected Organization; acknowledgments or rotation
  confirmations are tracked where tenants provide them.

## expected_audit

- Metadata-only rewrap audit events for the data-key rotation (ADR-0028 amendment: audited, no key
  material).
- Cloudflare account audit entries for credential resets, role changes, token revocations, Secrets
  Store secret creation, and binding changes.
- 1Password access-log entries for escrow reads during forensics and the new escrow item creation.
- Product audit entries for in-app containment actions (app-connection disconnects, grant
  invalidations).
- A signed audit export (ADR-0045) covering the incident window, archived with the forensic
  record.

## recovery

- **Rotation fails or is interrupted mid-rewrap:** the old root version stays bound until every
  data key is rewrapped; do not retire early. Resume or restart per the failed-or-interrupted
  rotation job runbook (Key management catalog row).
- **Escrow integrity in doubt:** treat the escrow copy as compromised custody material; the
  replacement key gets a fresh escrow item, and vault membership and access logs are reviewed
  before re-escrow.
- **Cloudflare account unrecoverable:** restore decryptability from the 1Password escrow copy
  into a fresh account and Secrets Store secret per the bootstrap runbook's recovery section;
  treat everything in the old account as hostile.
- **Terminal honesty:** there is no cryptographic recovery from old-root-plus-prior-dump exposure.
  The incident closes only when affected tenants have rotated upstream; until then the exposed
  plaintext remains valid wherever it is used.

## customer_communication

Mandatory for confirmed or assumed root-key extraction; default-on for the other custody-material
cases unless forensics affirmatively bounds exposure away from tenant data. The notification
follows the honest containment claim posture (ADR-0059): state what insecur contained (root
rotated, account reset, provider credentials rotated or disconnected) and state plainly what
insecur cannot do — invalidate the tenant's credentials at their upstream issuers. The
notification instructs tenants to rotate every secret stored under the affected scope at its
issuer and to treat pre-incident values as exposed. Scoping comes from the product audit log
collected in `execute`. Timing and content are coordinated with counsel and the insurer, the same
relationship ADR-0048 names for the forensic retention floor.

## no_reveal_handling

- Triage and forensic collection are metadata-only; do not paste suspected leaked values into
  any transcript or tool (ADR-0059).
- The replacement root key follows the Root Key Rotation ceremony's safe-input rules only.
- Forensic evidence references locations, hashes, and time ranges by ID — never values.
- Tenant notifications describe containment actions, not secret or credential contents.

## evidence

Attach to the Security Evidence Bundle, all metadata-only:

- Incident ID, classification, and timeline.
- Old and new root key version IDs and rewrap completion count.
- Cloudflare reset and revocation event IDs; Secrets Store secret and binding change IDs.
- Forensic copy references for all three sources (location, hash, time range), by ID, never by
  value.
- Tenant notification dispatch record and acknowledgment status.
- When run as a drill: the drill ID for the `runbook.*` control evidence.
