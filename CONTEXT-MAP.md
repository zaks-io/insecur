# insecur Context Map

Use this file first when deciding which domain context to load. It is a routing
map for agents, not a glossary. `CONTEXT.md` is the glossary index; authoritative
term definitions live in per-domain slices under `docs/context/glossary/`, and
package context files point to the relevant slice.

For general repo orientation, start with `docs/agents/repo-navigation.md`.
Return here when you need to choose the right domain, app, package, or spec
context for a specific task.

## Global Context

- `CONTEXT.md` - glossary index: routes to the per-domain definition slices under
  `docs/context/glossary/`, which are the source of truth for domain language.
- `docs/context-map.md` - package ownership, dependency direction, and the
  scaffolded package cut.
- `docs/specs/README.md` - current implementation entry point.
- `docs/specs/product-spec.md` - consolidated product state and ADR links.
- `docs/specs/agent-workstreams.md` - implementation workstream shape.
- `docs/adr/README.md` - accepted decisions index.
- `docs/project-status.md` - current implementation status and next steps.

## App Contexts

| Path                      | Load when                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/api/CONTEXT.md`     | Working on the public API Worker: routes, request composition, bindings, API transport, hop token. |
| `apps/runtime/CONTEXT.md` | Working on the private Runtime Worker: the keyring/decrypt-egress deploy and `RuntimeService` RPC. |
| `packages/cli/CONTEXT.md` | Working on CLI commands, local config, safe input, output formatting, or child process execution.  |

## Scaffolded Package Contexts

| Path                                     | Module                                                         |
| ---------------------------------------- | -------------------------------------------------------------- |
| `packages/domain/CONTEXT.md`             | Shared domain primitives and stable vocabulary shapes.         |
| `packages/auth/CONTEXT.md`               | Human authentication sessions and User actor context.          |
| `packages/access/CONTEXT.md`             | Effective Access Resolver and scope-first authorization.       |
| `packages/tenant-store/CONTEXT.md`       | Tenant-Scoped Store and metadata isolation.                    |
| `packages/crypto/CONTEXT.md`             | Keyring, Encryption Envelope, and Ciphertext Identity Binding. |
| `packages/audit/CONTEXT.md`              | Audit Event Writer and metadata-only audit records.            |
| `packages/secret-store/CONTEXT.md`       | Secret Version Store and Blind Secret Write rules.             |
| `packages/runtime-injection/CONTEXT.md`  | Runtime Injection Grant Service.                               |
| `packages/onboarding/CONTEXT.md`         | Guided Organization Provisioning.                              |
| `packages/release-gate/CONTEXT.md`       | Security Evidence Bundle assembly and release-gate skeleton.   |
| `packages/instance-bootstrap/CONTEXT.md` | Instance Bootstrap and Bootstrap Operator Claim.               |
| `packages/operations/CONTEXT.md`         | Operation Store and Sync Target Serialization.                 |

## Reading Rules

1. Start with the most local `CONTEXT.md` for the files you are touching.
2. From `CONTEXT.md`, load only the glossary slice(s) your task names, unless the
   task spans multiple contexts. Load `docs/context/relationships.md`,
   `docs/context/glossary/terminology-rules.md`, or `docs/context/dialogue.md`
   only when you need cross-term structure, disambiguation, or usage examples.
3. Load ADRs only when the local context or spec names them, or when your change
   would contradict an accepted decision.
4. Do not redefine glossary terms in package context files. Each term is defined
   in exactly one slice under `docs/context/glossary/`; edit that slice when
   domain language changes.
5. Keep package context files small enough for routine agent navigation.
