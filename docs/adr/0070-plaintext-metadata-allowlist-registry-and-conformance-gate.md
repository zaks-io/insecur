# ADR-0070: Plaintext Metadata Allowlist Registry And Conformance Gate

Date: 2026-06-12

Status: Accepted

[CONTEXT.md](../../CONTEXT.md) defines the Plaintext Metadata Allowlist as the narrow set of
ordinary metadata fields allowed to remain plaintext because hiding them would make safe operation
and review harder, and its Relationships section makes the storage default explicit: metadata
fields default to Sensitive Metadata unless they are on the allowlist. Today that allowlist is a
vocabulary term with no checked-in artifact. The "Sensitive Metadata encryption" control row in
[docs/storage-security-gate.md](../storage-security-gate.md) cites "Sensitive Metadata field
inventory, encryption tests, search/index review" as primary evidence, which means a human
re-reading the schema. Per-store tests prove that the existing stores emit inline ciphertext
storage refs (`packages/tenant-store/test/plaintext-persistence-store.test.ts`), and the audit
package validates event payloads against an allowlist, but nothing in the repo fails when an agent
adds a new plaintext column to the schema. The workstreams about to be implemented are dense with
exactly the columns the Security Release Gates section of
[docs/security-plan.md](../security-plan.md) designates Sensitive Metadata — Approval Context
Notes, provider target names, policy binding names — so under fleet-scale implementation a
plaintext Sensitive Metadata column merges green and is only discoverable by the manual field
inventory the evidence column points at.

## Decision

Implementation note: this ADR decides the registry and conformance gates. The checked-in schema
registry, static unit check, and `information_schema` CI check are wired in
`packages/tenant-store`.

- The Plaintext Metadata Allowlist becomes a machine-readable registry checked in next to the
  Drizzle schema source of truth in `packages/tenant-store/src/db/schema/` (for example
  `plaintext-metadata-allowlist.ts`). W1 owns the registry together with the schema, per the W1
  section of [docs/specs/agent-workstreams.md](../specs/agent-workstreams.md). The CONTEXT.md term
  now names this artifact rather than a concept.
- Full enumeration, default deny. Every column of every user table — every table in the
  application's `public` schema; drizzle-kit's bookkeeping table lives in the separate `drizzle`
  schema and is out of scope — must appear in the registry with a category drawn from the
  normative allowlist vocabulary in [docs/context/relationships.md](../context/relationships.md): `opaque-id`,
  `display-name`, `type-code`, `status-code`, `timestamp`, `actor-id`, `count`, `flag`, plus
  envelope categories such as `ciphertext-ref` and `key-version` for columns that carry the
  encrypted form itself, and the payload/lookup/verifier categories below. A column with no
  registry entry fails the conformance test closed. The category vocabulary is part of the
  registry and is extended only by editing it in review.
- Category contracts (INS-185):
  - `validated-payload`: JSON payload columns whose keys and allowed shapes are enforced by named
    validators. Example columns: `audit_events.details`, `operations.progress`.
  - `plaintext-lookup-key`: user, provider, or integration chosen lookup identifiers that are
    intentionally plaintext but are not insecur-minted opaque IDs and not closed type codes.
    Example columns: `injection_grants.variable_keys`, `secrets.variable_key`,
    `sync_target_leases.target_identity`. Env var names and provider target identities are lookup
    keys, not `display-name` labels.
  - `verifier-material`: one-way verifier hash and salt material that may be plaintext-storable but
    is not a ciphertext reference. Example columns: `bootstrap_secret_verifiers.hash_b64`,
    `bootstrap_secret_verifiers.salt_b64`.
- `opaque-id` is limited to insecur-minted opaque identifiers. Do not classify user or provider
  lookup keys, validated JSON payloads, or verifier material under `opaque-id`, `type-code`,
  `display-name`, or `ciphertext-ref` when a more specific category applies.
- All column types are gated, including integers. The Sensitive Metadata Encryption bullet in
  [docs/security-plan.md](../security-plan.md) classifies exact Protected Environment Secret value
  byte lengths as Sensitive Metadata, and that field ships as an integer column a text-only gate
  would pass. The schema already mixes `text()`, `integer`, `bigint`, `boolean`, `timestamp`, and
  `jsonb` columns, so a gate scoped to text-bearing columns covers neither the present schema nor
  the known-sensitive integer class.
- No shape-heuristic carve-outs. Opaque Resource ID and ciphertext-ref columns are plain `text()`
  in the Drizzle schema, indistinguishable by column type from a provider target name or an
  approval note, and a name-based recognizer (trusting `*_id` or `*_ref`) is bypassable by naming
  a sensitive column to match. Nothing is auto-recognized; every column gets an explicit entry.
- Normative rule: a column not in the Plaintext Metadata Allowlist registry is presumed Sensitive
  Metadata and must be stored through the Sensitive Metadata envelope. The conformance gate fails
  closed on unregistered columns, and registering a column under a plaintext category is the
  explicit act that allows plaintext.
- The conformance test runs in the integration layer of
  [ADR-0065](./0065-test-layers-and-preview-smoke.md): it enumerates `information_schema.columns`
  for all user tables against the registry and runs alongside `test:rls` in the
  `postgres-integration` CI job. It is a named command inside the existing layer, not a new layer.
  A static variant of the same check against the exported Drizzle schema runs in the unit layer so
  violations surface in `pnpm verify` before push; the `information_schema` variant stays
  normative because it also catches raw-SQL migration drift the exported schema cannot see.
- The test fails closed in both directions: an unregistered column fails, and a registry entry
  with no matching column fails, so the artifact and the schema cannot drift apart.
- Adding a plaintext column therefore requires an explicit, review-visible registry diff in the
  same PR — the same ratchet-gate idiom as jscpd's `duplicates:ci` and knip in
  [docs/build-tooling.md](../build-tooling.md): the gate is the enforcement, the diff is the
  review surface.
- One vocabulary across surfaces. The audit payload validator — precedent
  `packages/audit/test/metadata-allowlist.test.ts`, which fails closed on forbidden sensitive-value
  keys and free-form codes in audit event payloads — and this schema registry are two enforcement
  surfaces of the same Plaintext Metadata Allowlist concept. Audit detail keys and schema columns
  are reviewed against the same category vocabulary so there is one allowlist concept, not two.
- Evidence wording in [docs/storage-security-gate.md](../storage-security-gate.md): the gate
  proves column placement (which columns are plaintext, and under what category); encryption tests
  still prove envelope correctness. The "Sensitive Metadata encryption" control row replaces
  "Sensitive Metadata field inventory" and "search/index review" with this named gate and retains
  "encryption tests."

## Options Considered

- **Keep review-only enforcement.** Rejected. The evidence column's "field inventory,
  search/index review" is a human re-reading the schema on every change, which is exactly the
  review-theater class this project's guardrails are supposed to replace with caller-agnostic
  structural checks, and it scales worst at the moment the schema grows fastest.
- **Gate only text-bearing columns, auto-recognizing envelope and Opaque Resource ID shapes.**
  Rejected. Integer columns can be Sensitive Metadata (exact Protected value byte lengths), and
  shape recognition would be load-bearing and bypassable: ID and ciphertext-ref columns are plain
  `text()`, so recognition would rest on naming conventions a sensitive column can imitate. Full
  enumeration costs little extra seeding at the current schema size and removes the bypass.
- **Denylist of known-sensitive column names.** Rejected. Denylist-by-default contradicts the
  allowlist-by-construction posture of [ADR-0030](./0030-hybrid-allowlisted-telemetry.md), and the
  columns that matter are the new ones a denylist has never heard of.
- **Enforce in the Sensitive Metadata store API instead of at the schema.** Rejected as the sole
  mechanism. Per-store tests already exist and do not close the gap: a column written by a new
  store, or by raw SQL in a migration, never passes through the existing store's API.
- **Static unit-layer check only.** Rejected as the sole mechanism. The database is the surface
  that leaks, and only the `information_schema` variant sees drift introduced by raw SQL in
  migrations; the static variant is kept as fast pre-push feedback, not as the gate of record.

## Consequences

- Seeding is mechanical and cheap now: the schema is twenty-five tables across five files in
  `packages/tenant-store/src/db/schema/`, and CONTEXT.md already enumerates the plaintext
  categories. The pre-launch recreate-over-migrate posture means a gate-caught column is a schema
  reset, not a re-encryption exercise; this is the cheapest moment the gate will ever be to adopt.
- Every schema change that adds a column now also touches the registry. That friction is the
  point: the registry diff is what makes a new plaintext field visible in review instead of
  invisible in a green build.
- The weakest evidence row in the storage security gate becomes a structural invariant: column
  placement is proven by a failing test rather than asserted by inventory review, while envelope
  correctness remains owned by the encryption tests.
- Doc propagation (owned separately from this ADR): the CONTEXT.md term points at the registry as
  canonical, the storage-security-gate evidence row names the gate while retaining "encryption
  tests," and the W1 Owns and interface-commitment lists in agent-workstreams gain the registry
  and conformance test.
- The category vocabulary becomes a shared review anchor for both audit payload keys and schema
  columns; a future field that is plaintext-safe in one surface and sensitive in the other must be
  argued in a registry diff rather than decided silently in either package.
