# ADR-0068: Stable Dotted-Code Vocabularies Live In Canonical Catalogs

Date: 2026-06-12

Status: Accepted

## Decision

[ADR-0062](0062-package-seam-failures-are-errorbody-compatible.md) pinned the catalog rule for one
stable dotted-code vocabulary: error codes live in `packages/domain/src/error-codes.ts`. This
sibling decision applies the same catalog principle to the other two runtime vocabularies that
share the dotted-code shape (`isStableDottedCode` in `packages/domain/src/stable-dotted-code.ts`):
audit event codes and operation intent codes. In both vocabularies, a code exists only by being
enumerated in its canonical catalog; passing the shape check is not registration.

### Audit event codes

- `packages/audit/src/audit-event-codes.ts` is the only registry. New audit event codes are added
  there and nowhere else.
- The grammar is `domain.action` with snake_case segments, matching the shared stable-dotted-code
  shape.
- The pairing rule is stated at the shipped registry's real looseness: every security-relevant
  action family has denied coverage, and denied codes end in `_denied` or are domain-level denial
  codes. The rule is per action family, not a mechanical suffix pair. In the registry as shipped,
  `access.denied` is a domain-level denial code with no success pair; `approval.action_denied` is
  the denied coverage for the `approval.request_created`, `approval.request_approved`, and
  `approval.request_rejected` success codes; and success/denied stems may differ, as in
  `onboarding.guided_organization_provisioned` paired with
  `onboarding.guided_organization_provision_denied`.
- The writer's rejection of unregistered codes is normative, not incidental. `validateAuditEventInput`
  in `packages/audit/src/validate-audit-event.ts` already rejects event codes outside the registry
  and rejects outcomes that do not match the code's success or denied classification; this ADR
  promotes that behavior from implementation detail to contract.

### Operation intent codes

- A canonical `OPERATION_INTENT_CODES` catalog lives in `packages/operations`, beside the existing
  shape validator in `packages/operations/src/validate-operation-metadata.ts`.
- `createOperation` validates registry membership, not just dotted shape. Today
  `validateOperationIntentCode` checks only `isStableDottedCode`; membership becomes the check.
- One intent code names exactly one workflow.
  [ADR-0066](0066-operation-idempotency-key-contract.md) made intent-code identity the normative
  idempotency check: the same key with a different intent code fails with
  `operation.idempotency_mismatch`, while the same key with the same intent code resolves as an
  idempotent retry. That check is structurally blind to same-key-same-intent collisions across
  different workflows: if two workflows shared a generic intent code, a key collision between them
  would resolve as a retry with `created=false` instead of surfacing a conflict. The
  one-code-one-workflow registry rule is what gives the mismatch check its meaning.
- The catalog starts with no production members. No production caller mints a concrete intent code
  yet; literal codes such as `sync.run` appear only in tests. Registration costs nothing now and
  becomes a cross-group rename after parallel implementation groups land.

### Lockstep

Both registries inherit the lockstep-sentence pattern already used by
[docs/operation-store.md](../operation-store.md) for operation states: the registry module is the
enforcing implementation and must change in lockstep with the doc section that carries this
vocabulary contract; that section, not the code file, is the spec for the grammar, pairing, and
membership rules. The enumerated members themselves stay canonical in the registry file, the same
way docs point at the Authorization Scope and Role-preset registries in `packages/access` rather
than restating them.

## Options Considered

- **Amend ADR-0062 to cover all dotted-code vocabularies.** Rejected. ADR-0062's decision subject
  is ErrorBody compatibility for failures crossing package seams; audit events and operation
  intents are not failures. Retrofitting them would muddy a crisp decision record, so this sibling
  ADR cites ADR-0062 as precedent instead.
- **Shape-only validation, the status quo for intent codes.** Rejected. `isStableDottedCode`
  admits any spelling, so parallel implementation groups minting codes from specs diverge (`sync.run` vs
  `syncs.run` vs `secret_sync.execute`), denied pairs get omitted, and nothing stops one generic
  intent code from naming two workflows, which blinds the ADR-0066 mismatch check.
- **A mechanical `domain.action` / `domain.action_denied` suffix pairing rule.** Rejected. The
  shipped forensic registry would be born non-compliant: `access.denied`,
  `approval.action_denied`, and the provisioned/provision_denied stem mismatch all break a strict
  suffix rule, inviting a rename of permanent forensic vocabulary, which is the exact drift this
  ADR exists to prevent.
- **Intent-code catalog in `packages/domain`.** Rejected. The shape validator and
  `createOperation` already live in `packages/operations`, so splitting the catalog from its
  enforcing validator adds a cross-package seam for no consumer, and leaving the location as an
  either/or would itself be a divergence point.

## Consequences

- The audit side documents existing enforcement rather than building new scope: registry
  membership and outcome pairing are already enforced by
  `packages/audit/src/validate-audit-event.ts`, and renames of registered codes are now contract
  changes. Audit event codes are permanent forensic vocabulary; once real tenants exist, renaming
  one rewrites the meaning of signed exports and runbook expectations, so the vocabulary is pinned
  during the recreate-over-migrate window while renames are still free.
- The intent-code side requires a small code follow-up in the style of ADR-0066's consequences:
  adding the `OPERATION_INTENT_CODES` catalog file in `packages/operations` and tightening
  `validateOperationIntentCode` (called by `createOperation`) from shape validation to registry
  membership is tracked by a follow-up ticket. This ADR ships no code.
- [docs/specs/product-spec.md](../specs/product-spec.md) section 11 points at the audit registry
  and states the grammar and pairing rule; [docs/operation-store.md](../operation-store.md) gains
  an Intent Codes subsection pointing at the intent catalog; and
  [docs/specs/architecture-groups.md](../specs/architecture-groups.md) AG10 references the audit
  registry the way AG2 references the `packages/access` registries. Those docs and this ADR must
  change together.
