# insecur Context Map

Use this file first when deciding which domain context to load. It is a routing
map for agents, not a glossary. Authoritative term definitions live in
`CONTEXT.md`; package context files point to the relevant slices.

For general repo orientation, start with `docs/agents/repo-navigation.md`.
Return here when you need to choose the right domain, app, package, or spec
context for a specific task.

## Global Context

- `CONTEXT.md` - source of truth for domain language across the repo.
- `docs/context-map.md` - package ownership, dependency direction, and First
  Value package cut.
- `docs/specs/README.md` - current implementation entry point.
- `docs/specs/product-spec.md` - consolidated product state and ADR links.
- `docs/specs/agent-workstreams.md` - implementation workstream shape.
- `docs/adr/README.md` - accepted decisions index.
- `docs/project-status.md` - current implementation status and next steps.

## App Contexts

| Path | Load when |
| --- | --- |
| `apps/worker/CONTEXT.md` | Working on Cloudflare Worker routes, request composition, bindings, or API transport. |
| `packages/cli/CONTEXT.md` | Working on CLI commands, local config, safe input, output formatting, or child process execution. |

## First Value Package Contexts

| Path | Module |
| --- | --- |
| `packages/domain/CONTEXT.md` | Shared domain primitives and stable vocabulary shapes. |
| `packages/access/CONTEXT.md` | Effective Access Resolver and scope-first authorization. |
| `packages/tenant-store/CONTEXT.md` | Tenant-Scoped Store and metadata isolation. |
| `packages/crypto/CONTEXT.md` | Keyring, Encryption Envelope, and Ciphertext Identity Binding. |
| `packages/audit/CONTEXT.md` | Audit Event Writer and metadata-only audit records. |
| `packages/secrets/CONTEXT.md` | Secret Version Store and Blind Secret Write rules. |
| `packages/runtime-injection/CONTEXT.md` | Runtime Injection Grant Service. |
| `packages/onboarding/CONTEXT.md` | Guided Organization Provisioning. |

## Reading Rules

1. Start with the most local `CONTEXT.md` for the files you are touching.
2. Load only the named terms from root `CONTEXT.md`, unless the task spans
   multiple contexts.
3. Load ADRs only when the local context or spec names them, or when your change
   would contradict an accepted decision.
4. Do not redefine glossary terms in package context files. Edit root
   `CONTEXT.md` when domain language changes.
5. Keep package context files small enough for routine agent navigation.
