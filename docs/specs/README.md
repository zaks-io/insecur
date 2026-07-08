# Specs

This directory is the implementation entry point for agents. The ADRs remain the decision history,
but agents should not have to rediscover the current product by reading every ADR in order.

Read in this order:

1. [Canonical Product Spec](product-spec.md) - the decided product shape, V1 boundary, and ADR trace
   links in one linear document.
2. [Architecture Groups](architecture-groups.md) - architectural ownership groups, seams,
   dependencies, and handoff contracts for autonomous agents.
3. [Customer Validation And Excellence Plan](../customer-validation.md) - the first buyer,
   proof loop, design-partner loop, and success signals that should constrain First Value scope.
4. [CONTEXT.md](../../CONTEXT.md) - glossary index routing to the per-domain definition slices
   under [docs/context/glossary/](../context/glossary/).
5. Area docs only when the architecture group calls for them, such as
   [First Value Milestone](../first-value-milestone.md),
   [Storage Security Gate](../storage-security-gate.md),
   [Protected Change Orchestration](../protected-change-orchestration.md),
   [Operation Store](../operation-store.md),
   [CLI And Sync Plan](../cli-and-sync.md), or
   [Security Runbooks And Release Gates](../security-runbooks-and-release-gates.md).

## Source Of Truth Rules

- The specs summarize accepted ADRs and the scope decisions in [phasing.md](../phasing.md).
- ADRs are still the rationale and traceability record. Each spec section links back to the ADRs
  that justify it.
- Superseded ADRs are linked only as "do not implement this older mechanism" evidence.
- If a spec and an ADR disagree, do not guess. Treat it as a documentation defect, reopen the
  decision, and update both the spec and the ADR trail.
- If an architecture group needs a new architectural decision, add or amend an ADR first, then
  update these specs so future agents continue to start from one place.

### Content ownership

Every class of normative content has exactly one owning location; every other doc points at the
owner instead of restating it. This table is the normative owner-map, per
[ADR-0067](../adr/0067-documentation-content-ownership-and-single-statement-rule.md).

| Content type                                                | Owning location                                                                                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Shared cross-context domain vocabulary and term definitions | the per-domain slices under [docs/context/glossary/](../context/glossary/), indexed by root [CONTEXT.md](../../CONTEXT.md) |
| Terms scoped to one bounded context                         | that package or app `CONTEXT.md`                                                                                           |
| Decided product behavior, invariants, and the V1 boundary   | [product-spec.md](product-spec.md)                                                                                         |
| Decision rationale and traceability                         | the governing ADR under `docs/adr/`                                                                                        |
| Deferred scope and its promotion triggers                   | the [phasing.md](../phasing.md) deferred scope parking lot                                                                 |
| Architecture group ownership, seams, and integration order  | [architecture-groups.md](architecture-groups.md)                                                                           |
| Live implementation status                                  | [project-status.md](../project-status.md)                                                                                  |
| Code-enforced registries                                    | the named package file, paired with a doc section by a lockstep sentence                                                   |

The per-domain glossary slices under `docs/context/glossary/` (indexed by root `CONTEXT.md`) own
vocabulary shared across contexts; a package or app `CONTEXT.md` owns a term that exists only inside
its bounded context. A term is defined in exactly one place, never both.

### The single-statement rule

A normative enumeration, table, constant, route shape, or list appears exactly once, in its owning
location; every other doc links to the owner and must not restate it. Non-normative paraphrase
written for narrative flow is not a violation. The rule is forward-binding — it governs new and
repaired text, not an immediate corpus-wide de-duplication pass; pre-existing restatements are
grandfathered defects removed when their doc is next touched or as the defect sweep reaches them.
See [ADR-0067](../adr/0067-documentation-content-ownership-and-single-statement-rule.md).

### Conflict resolution

When a non-owning doc disagrees with the owning doc about content the owner owns, the non-owning
doc is the defect: check the owner against the ADR trace it links, then proceed on the owner's
content and file the defect against the non-owning doc without stopping. The spec-vs-ADR rule above
is the owner-vs-owner case and is unchanged — if the owner itself disagrees with its governing ADR,
stop, treat it as a documentation defect, reopen the decision, and update both the owner and the
ADR trail. See
[ADR-0067](../adr/0067-documentation-content-ownership-and-single-statement-rule.md).

## Current Implementation Status

Live implementation status — what is built, what is verified, and what is not wired yet — lives in
[project-status.md](../project-status.md). This entry point intentionally carries no capability
snapshot so it cannot rot against that document.

One ADR-0018 directive stays normative regardless of status: the previous pre-V1 scaffold was
removed as disposable learning code. New work must implement the target product described here,
not preserve or compatibly emulate the removed scaffold.

Trace: [ADR-0018](../adr/0018-retire-unsafe-pre-v1-scaffold.md),
[project-status.md](../project-status.md).
