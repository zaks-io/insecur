# ADR-0067: Documentation Content Ownership And The Single-Statement Rule

Date: 2026-06-12

Status: Accepted

## Decision

Every class of normative documentation content has exactly one owning location, every other doc
points at the owner instead of restating the content, and a conflict between a non-owning doc and
its owner resolves deterministically in the owner's favor. This completes the corpus's two partial
conflict rules — the spec-vs-ADR rule in the Source Of Truth Rules of
[docs/specs/README.md](../specs/README.md) and the unconditional "stop and surface the conflict"
habit in [docs/agents/repo-navigation.md](../agents/repo-navigation.md) — and ends the competition
between standing authority claims: the root glossary's "source of truth for domain language" and
the product spec's "canonical" are both true, each for the content type it owns.

### Content ownership

| Content type                                                | Owning location                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| Shared cross-context domain vocabulary and term definitions | root [CONTEXT.md](../../CONTEXT.md)                                      |
| Terms scoped to one bounded context                         | that package or app `CONTEXT.md`                                         |
| Decided product behavior, invariants, and the V1 boundary   | [product-spec.md](../specs/product-spec.md)                              |
| Decision rationale and traceability                         | the governing ADR under `docs/adr/`                                      |
| Deferred scope and its promotion triggers                   | the [phasing.md](../phasing.md) deferred scope parking lot               |
| Workstream ownership, seams, and integration order          | [agent-workstreams.md](../specs/agent-workstreams.md)                    |
| Live implementation status                                  | [project-status.md](../project-status.md)                                |
| Code-enforced registries                                    | the named package file, paired with a doc section by a lockstep sentence |

Vocabulary splits along the multi-context layout described in
[docs/agents/domain.md](../agents/domain.md): root `CONTEXT.md` owns vocabulary shared across
contexts, and a package or app `CONTEXT.md` owns a term that exists only inside its bounded
context. A term is defined in exactly one place, never both. Today every local context file is a
reading map and all definitions live at root; a local definition is added only for a genuinely
context-local term, and it moves to root the moment a second context needs it.

For code-enforced registries the owner is the doc-plus-code pair, and the pair's lockstep sentence
states which side is the spec. The shipped examples: the error-code-to-exit-code table in
[cli-and-sync.md](../cli-and-sync.md) is normative and `packages/cli/src/output/exit-codes.ts`
enforces it; the State Model section of [operation-store.md](../operation-store.md) is the spec and
`packages/operations/src/operation-states.ts` enforces it; per
[product-spec.md](../specs/product-spec.md), `packages/access/src/authorization-scopes.ts` and
`packages/access/src/built-in-role-scopes.ts` are the canonical source for scope atom names and
preset bundles while the spec's relational constraints stay normative. A registry that has no
lockstep sentence yet, such as the audit event codes in `packages/audit/src/audit-event-codes.ts`,
gains one the first time a doc needs to reference it.

### The single-statement rule

A normative enumeration, table, constant, route shape, or list appears exactly once, in its owning
location. Every other doc that needs the content links to the owner and must not restate it. The
owner-pointer idiom the repaired docs already use ad hoc is the standard mechanism: the
[cli-and-sync.md](../cli-and-sync.md) API Shape pointer to the normative route-shape rule in
[product-spec.md](../specs/product-spec.md), the [specs entry point](../specs/README.md) carrying
no capability snapshot so it cannot rot against [project-status.md](../project-status.md), and the
lockstep sentences above.

The rule is scoped to exactly those normative forms. Non-normative paraphrase written for
narrative flow is legal and is not a violation; the rule exists to kill drifting copies of
decisions, not to turn area docs into link soup.

The rule is forward-binding: it governs new text and text being repaired. Pre-existing
restatements are grandfathered as known defects — remove them when the containing doc is next
touched, or as the ongoing documentation defect sweep reaches them. This ADR mandates no immediate
corpus-wide de-duplication pass.

### Deterministic conflict resolution

When a non-owning doc disagrees with the owning doc about content the owner owns, the non-owning
doc is the defect by definition. The agent first checks the owner against the ADR trace the owner
links for that content. If the owner agrees with its governing ADR, the agent proceeds on the
owner's content and files the documentation defect against the non-owning doc; it does not stop.
If the owner itself disagrees with its governing ADR, the conflict is owner-vs-owner and the
existing Source Of Truth Rules behavior is unchanged: stop, treat it as a documentation defect,
reopen the decision, and update both the owner and the ADR trail. The trace check exists because a
satellite doc is sometimes the one that was correctly updated; checking the owner against its
governing decision prevents proceeding on a stale owner.

### Normative home

The ownership table and rules above are carried by the Source Of Truth Rules section of
[docs/specs/README.md](../specs/README.md), which is the normative owner-map agents consult; this
ADR is its decision record, and the two change together. The "Where Things Live" table in
[docs/agents/repo-navigation.md](../agents/repo-navigation.md) is demoted to a navigational
pointer: it routes a reader to a starting doc, carries no ownership authority, and where it
disagrees with the owner-map it is the defect. The same doc's unconditional conflict rule — "stop
and surface the conflict instead of choosing the more convenient source" — is replaced by a
reference to the deterministic resolution above.

## Options Considered

- **Keep blanket stop-and-surface for every conflict.** Rejected. It resolves nothing outside the
  spec-vs-ADR pair, and at fleet scale it stalls an agent on every duplicated sentence that has
  drifted — while [agent-workstreams.md](../specs/agent-workstreams.md) scopes workstream agents to
  read only the ADRs and area docs linked from their workstream, so a stale restatement is often
  undetectable by its reader in the first place.
- **Allow restatement when labeled informative.** Rejected. Labeled copies rot exactly like
  unlabeled ones, and the documentation defect backlog is dominated by restatements that were
  faithful summaries when written.
- **Home the owner-map in repo-navigation.md "Where Things Live".** Rejected. That table is a
  navigation aid. Making it normative alongside the Source Of Truth Rules creates two parallel
  authority tables, which is the precise drift failure this ADR exists to kill. One normative map,
  one navigational pointer.
- **Mandate an immediate corpus-wide de-duplication pass.** Rejected. Most existing area docs
  restate something today and would be instantly non-compliant. Fix-on-touch plus the ongoing
  defect sweep cleans up the backlog without a mass rewrite.
- **Apply the single-statement rule to all prose.** Rejected. Stripping every paraphrase would make
  area docs unreadable. The defect class that actually bites is normative enumerations, tables,
  constants, route shapes, and lists, so the rule binds exactly those.

## Consequences

- The Source Of Truth Rules section of [docs/specs/README.md](../specs/README.md) gains the
  ownership table and these rules, and [docs/agents/repo-navigation.md](../agents/repo-navigation.md)
  is edited to demote "Where Things Live" and rewrite its conflict line. Those edits travel with
  this ADR.
- Agents stop stalling on satellite-doc drift. The common case becomes proceed-on-owner plus a
  filed defect; only owner-vs-owner conflicts — a spec against an ADR, or an owner against its own
  governing ADR — still halt work to reopen the decision.
- Pre-existing restatements stay until their doc is touched. New and repaired text must use owner
  pointers, so the restatement backlog shrinks instead of regrowing behind the sweep.
- A new normative enumeration must land in its owner's row before other docs reference it, which
  occasionally forces a small owner edit ahead of an area-doc edit. That ordering cost is the
  price of one statement per fact.
