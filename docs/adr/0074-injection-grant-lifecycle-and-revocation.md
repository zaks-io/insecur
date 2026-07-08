# ADR-0074: Injection Grant Lifecycle And Revocation

Date: 2026-06-12

Status: Accepted

## Decision

Three decided flows already mutate Injection Grants after issue — compromise response invalidates
non-expired grants for the old version ([ADR-0059](0059-tenant-reported-secret-compromise-response.md),
product-spec §12), and Tenant Suspension revokes active grants
([docs/security-plan.md](../security-plan.md)) — but the only normative lifecycle facts were "fresh,
one-use, and non-reusable" (CONTEXT.md Injection Grant invariants) and "grant consumption is
compare-and-set" (product-spec §7, [ADR-0027](0027-shared-instance-topology-and-binding-map.md)).
This ADR pins the full lifecycle: states, binding time, consume semantics, revocation verbs,
reinstatement behavior, and retention.

### State machine

`issued → consumed | expired | revoked`. `issued` is the only non-terminal state. All three
non-issued states are terminal: nothing transitions out of `consumed`, `expired`, or `revoked`,
and nothing transitions between them. The contract is this observable state machine, not a column
shape; the shipped representation derives state from `consumed_at` and `expires_at` on the grant
row, and the revocation marker is the not-yet-shipped piece (see Consequences).

### Secret bindings and delivered secret version IDs pin at issue

A grant's secret bindings and its delivered secret version ID are fixed when the grant is issued
and are never re-resolved at consume. This codifies shipped behavior:
`packages/runtime-injection/src/issue-injection-grant.ts` runs `resolveInjectionGrantBinding`
(selector to secret ID, Variable Key, and the Current Version's secret version ID) before
`insertGrant` persists that binding on the grant row, and
`packages/runtime-injection/src/consume-injection-grant.ts` loads the stored binding and decrypts
exactly the stored secret version ID. [ADR-0016](0016-delivery-first-secret-egress.md) already
pins every grant to the exact immutable Runtime Injection Policy Version and its immutable secret
IDs; this ADR extends the pin normatively to the delivered secret version ID, matching ADR-0016's
forensic requirement that grant audit record delivered secret version IDs.

Pin-at-issue is what makes ADR-0059's containment step — "invalidate non-expired Injection Grants
that reference the old version" — meaningful. Under resolve-at-consume, no grant references any
version until it is consumed, so per-version invalidation would select nothing and the decided
compromise-response runbook step would be a no-op. A corollary: a version published after issue
does not flow through an already-issued grant. The grant delivers the version it was issued for or
fails; freshness comes from the short TTL and the one-use rule, not from late binding.

### Consume is one CAS with lazy expiry and a revocation check

Consume is a single compare-and-set update per ADR-0027: mark the grant consumed where it is
unconsumed, not revoked, the requested binding matches the stored binding, and `expires_at` is
still in the future — clock expiry is evaluated lazily inside the CAS predicate, at consume time
only. Zero rows affected fails closed. No background sweeper or cron marks grants expired or reaps
rows; V1 adopts for grants the same no-sweeper posture
[ADR-0057](0057-inline-sync-execution-and-partial-failure-model.md) set for sync-operation
resumption, as this ADR's own decision.

Terminal states map onto the existing error vocabulary (`INJECTION_ERROR_CODES` in
`packages/domain/src/error-codes.ts`, exit table in [docs/cli-and-sync.md](../cli-and-sync.md));
no new codes:

| Consume against                  | Stable error code                                              | CLI exit |
| -------------------------------- | -------------------------------------------------------------- | -------- |
| revoked grant                    | `injection.grant_denied`                                       | `4`      |
| clock expiry observed at consume | `injection.grant_expired`                                      | `6`      |
| already consumed (CAS miss)      | fail closed per ADR-0027, surfaced as `injection.grant_denied` | `4`      |

The shipped consume path already maps not-found and binding-mismatch failures to
`injection.grant_denied`; `revoked` deliberately joins that bucket, so a caller cannot distinguish
revocation (a suspension or incident signal) from absence.

### Revocation verbs in V1 are exactly two

1. **Tenant Suspension** revokes all active (issued, unconsumed, unexpired) Injection Grants for
   the suspended Organization ([docs/security-plan.md](../security-plan.md)).
2. **Compromise-response version invalidation** (ADR-0059 delivery containment) revokes
   non-expired grants whose pinned delivered secret version ID references the compromised version.

Nothing else revokes. In particular, in-flight grants survive ordinary Runtime Injection Policy
edits: an edit creates a new immutable Runtime Injection Policy Version (ADR-0016) and changes
which version authorizes future issues, while already-issued grants reference the exact version
that authorized them and remain consumable until consumed or expired. The short TTL bounds the
window (the shipped First Value TTL is 300 seconds,
`packages/runtime-injection/src/injection-grant-ttl.ts`). If issued grants must die because the
binding itself is suspect, that is the ADR-0059 path, not a policy edit.

### Revocation survives tenant reinstatement

Reinstating a suspended Organization never returns a revoked grant to `issued`; `revoked` is
terminal. Reinstated Organizations obtain fresh grants through the normal issue path, parallel to
the security-plan rule that reinstated Organizations require fresh Approval Requests from
currently authorized requesters.

### Retention

Grant rows are retained as metadata-only audit material: opaque IDs, the
organization/project/environment coordinate, secret IDs, Variable Keys, the pinned secret version
ID, issue/expiry/consume timestamps, and the revocation marker. A grant row never contains a
Sensitive Value; decryption happens transiently in the consume path. Retained rows are what
ADR-0059 reach enumeration selects on, and the posture parallels ADR-0016's indefinite retention
of Runtime Injection Policy Versions as non-plaintext audit metadata. There is no TTL-based row
deletion in V1.

## Options Considered

- **Resolve bindings at consume time.** Rejected. The set of grants "that reference the old
  version" would be unknowable before consume, making ADR-0059's decided containment step
  unexecutable, and it contradicts the shipped issue path, which persists the resolved version at
  insert.
- **Eager expiry via a status sweeper or cron.** Rejected for V1. The lazy CAS predicate already
  enforces expiry at the only place state is consulted, and a sweeper adds a background job V1
  deliberately does not run.
- **Policy edits revoke in-flight grants.** Rejected. Grants reference immutable policy versions
  precisely so issue-time authorization stays reconstructable; auto-revoke would turn routine
  policy housekeeping into a delivery outage and add a third revocation verb V1 does not need.
- **A dedicated `injection.grant_revoked` error code.** Rejected. Existing codes cover the
  semantics, and a distinct revoked code would leak suspension or incident state to the caller.
- **Restoring revoked grants on reinstatement.** Rejected. A grant issued under pre-suspension
  authority must not become consumable under post-reinstatement authority; the fresh-Approval-
  Requests rule already settled this shape.

## Consequences

- The shipped issue/consume path (`packages/runtime-injection`, `TenantInjectionGrantStore` in
  `packages/tenant-store`) already implements pin-at-issue and the lazy-expiry one-use CAS; this
  ADR makes both contract rather than implementation accident before the revocation half ships.
- Revocation has no shipped representation yet: the grant row carries no revocation marker and the
  consume CAS does not check one. The marker, the CAS predicate, and the two revocation writers
  land with the suspension and compromise-response work (the grant service is AG5 with AG7 in
  [docs/specs/architecture-groups.md](../specs/architecture-groups.md)). Pre-launch this is a
  recreate-from-scratch schema change, not a migration.
- The error-code surface is unchanged: no edits to `INJECTION_ERROR_CODES`, the
  [docs/cli-and-sync.md](../cli-and-sync.md) exit table, or `exitCodeForErrorCode`.
- product-spec §7 and CONTEXT.md's Injection Grant entries summarize this lifecycle and must
  change together with this ADR.
