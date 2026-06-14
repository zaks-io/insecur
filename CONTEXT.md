# insecur Context

insecur is a secrets-management product for organizing, protecting, versioning, and syncing secrets across many projects and teams.

This file is the **index** for the domain glossary. It holds no definitions. Term
definitions live in per-domain slices under [`docs/context/glossary/`](docs/context/glossary/),
so an agent loads only the concepts it needs instead of the whole vocabulary. Each
term is defined in exactly one slice and is single-sourced: never copy a definition
into a package context file, and when domain language changes, edit the owning slice.

## How To Load Domain Context

1. Find the domain your task touches in the routing table below and open that one
   glossary slice. That is the smallest load that answers "what does this term mean."
2. Need cross-term structure (how terms relate)? Load
   [`docs/context/relationships.md`](docs/context/relationships.md).
3. Choosing between competing terms ("is this a Role or an Authorization Scope")? Load
   [`docs/context/glossary/terminology-rules.md`](docs/context/glossary/terminology-rules.md).
4. Want worked usage examples? Load [`docs/context/dialogue.md`](docs/context/dialogue.md).
5. Package or app work? Start at the local `CONTEXT.md` named by
   [`CONTEXT-MAP.md`](CONTEXT-MAP.md); it points at the exact glossary slice to load.

## Glossary Routing Table

| Domain                                         | Glossary slice                                                                                | Term span                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Instance and onboarding                        | [`glossary/instance-onboarding.md`](docs/context/glossary/instance-onboarding.md)             | **Actor** through **Invitation**                                                         |
| Access and authorization                       | [`glossary/access-authorization.md`](docs/context/glossary/access-authorization.md)           | **Agent** through **Default Team**                                                       |
| Project and secret lifecycle                   | [`glossary/project-secret-lifecycle.md`](docs/context/glossary/project-secret-lifecycle.md)   | **Project** through **Secret Source of Truth**                                           |
| Protected change orchestration                 | [`glossary/protected-change.md`](docs/context/glossary/protected-change.md)                   | **Promotion** through **Rollback Retention Window**                                      |
| Sensitive data and safety gates                | [`glossary/sensitive-data-safety.md`](docs/context/glossary/sensitive-data-safety.md)         | **Secret Egress** through **Destructive Confirmation**                                   |
| Runtime injection and delivery                 | [`glossary/runtime-injection.md`](docs/context/glossary/runtime-injection.md)                 | **Runtime Injection** through **Secret Use**                                             |
| Machine access and provider connections        | [`glossary/machine-access.md`](docs/context/glossary/machine-access.md)                       | **Protected Environment** through **Provider Drift**                                     |
| Secret sync and provider targets               | [`glossary/secret-sync.md`](docs/context/glossary/secret-sync.md)                             | **Secret Sync** through **Vercel Deployment Target**                                     |
| Cryptography, storage, and audit               | [`glossary/crypto-storage-audit.md`](docs/context/glossary/crypto-storage-audit.md)           | **Organization Data Key** through **Audit Export**                                       |
| Operations, deploy topology, and release gates | [`glossary/operations-deploy-release.md`](docs/context/glossary/operations-deploy-release.md) | **Deploy Topology** terms plus **Security Runbook** through **Security Evidence Bundle** |

Supporting context files under [`docs/context/`](docs/context/):

- [`glossary/terminology-rules.md`](docs/context/glossary/terminology-rules.md) - cross-cutting disambiguation rules ("X is ambiguous between A, B, C").
- [`relationships.md`](docs/context/relationships.md) - how terms relate to each other.
- [`dialogue.md`](docs/context/dialogue.md) - worked Q&A showing the vocabulary in use.

Within a slice, find a definition by its exact term heading, such as
`**Protected Change Orchestrator**:`. Each definition carries an `_Avoid_:` line of
discouraged synonyms for that one term.

## Architecture Docs That Deepen The Glossary

- [`CONTEXT-MAP.md`](CONTEXT-MAP.md) owns the agent routing map across root, app, and package context files.
- [`docs/context-map.md`](docs/context-map.md) owns the package context map and package ownership rules.
- [`docs/first-value-milestone.md`](docs/first-value-milestone.md) owns the **First Value Milestone** integration contract.
- [`docs/protected-change-orchestration.md`](docs/protected-change-orchestration.md) owns the **Protected Change Orchestrator** Interface.
- [`docs/operation-store.md`](docs/operation-store.md) owns the **Operation Store** Interface.
- [`docs/storage-security-gate.md`](docs/storage-security-gate.md) owns the **Storage Security Gate** Interface.
- [`docs/security-runbooks-and-release-gates.md`](docs/security-runbooks-and-release-gates.md) owns the **Security Runbook**, **Security Release Gate**, and **Security Evidence Bundle** Interfaces.
- [`docs/adr/README.md`](docs/adr/README.md) indexes accepted decisions behind the terms.

## Terminology Posture

- Use industry-standard terms when they have clear meaning in secrets management and distributed systems: **Tenant**, **Organization**, **Project**, **Environment**, **Secret**, **Secret Version**, **Runtime Injection**, **Machine Identity**, **OIDC**, **Audit Log**, **Keyring**, **Encryption Envelope**, **Row-Level Security**, **Idempotency Key**, **Lease**, and **Fencing Token**.
- Keep Insecur-specific product terms only where common alternatives are ambiguous: **Secret Shape**, **Environment Deploy Key**, **First Value Milestone**, **First Value Proof**, **Storage Security Gate**, **Protected Change Orchestrator**, and **Operation Store**.
- When provider vocabulary collides with Insecur vocabulary, qualify the provider term explicitly, such as **GitHub Environment** or **Vercel Deployment Target**. Do not use provider-native names as unqualified domain terms.
