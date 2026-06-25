# Package Context Map

This map turns the glossary into package ownership. `../CONTEXT-MAP.md` is the root
agent routing map and `../CONTEXT.md` is the glossary index; the source-of-truth
vocabulary lives in per-domain slices under `../docs/context/glossary/`. Packages
own the implementation seams that make that vocabulary executable and testable.

The goal is not one package per glossary slice. A package exists when it gives
callers leverage through a small Interface and gives maintainers locality for a
set of invariants, tests, and error modes.

## Package Rules

- Each package owns one deep domain module or a tightly related module family.
- Each package has a local `CONTEXT.md` reading map that names the glossary slice,
  terms, and deeper docs an agent should load for that package.
- Each package README names what the package owns, consumes, and must not own.
- Package `CONTEXT.md` files are scoped reading maps, not independent
  glossaries. Each term is defined in exactly one slice under
  `../docs/context/glossary/`; edit term definitions there.
- Tests live with the package whose Interface they exercise.
- Stable error codes and result shapes live with the package that owns the
  invariant behind them.
- The worker and CLI compose packages; they should not reimplement package
  invariants in routes, command handlers, or adapters.
- The glossary slices remain global language. Package context files route agents
  to terms instead of copying glossary definitions.

## Context File Contract

Use package `CONTEXT.md` files to avoid loading the entire glossary for
routine package work. A package context file should stay small and contain:

- the package role
- the local read-first docs
- the glossary slice and terms to load
- terms to load only for adjacent work
- what the package owns
- what the package must not own

Do not redefine terms in package context files.

## Dependency Direction

Packages depend toward more primitive concepts:

```text
apps/api
apps/runtime
  -> packages/worker-kit
packages/cli
  -> packages/tenant-keyring
  -> packages/instance-bootstrap
  -> packages/onboarding
  -> packages/runtime-injection
  -> packages/runtime-injection-issue
  -> packages/secret-store
  -> packages/secret-store-contracts
  -> packages/operations
  -> packages/auth
  -> packages/access
  -> packages/audit
  -> packages/tenant-store
  -> packages/crypto
  -> packages/custody-contracts
  -> packages/token-signing
  -> packages/domain
```

This is a conceptual direction, not a requirement that every package imports
every package below it. Add dependencies only when code crosses that Interface.

## Scaffolded Packages

These packages are scaffolded now with real seams, even where the
implementations are narrow. Every row except `@insecur/operations` is part of
the First Value cut (the First Value Milestone must use the real seams);
`@insecur/operations` is scaffolded for the Production Delivery foundation and
is not in the First Value Slice below.

| Package                            | Module                                | Owns                                                                                                                                                                               | Does not own                                                                                         |
| ---------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `@insecur/domain`                  | Domain primitives                     | Opaque Resource IDs, Display Names, Variable Keys, stable result vocabulary, shared branded types                                                                                  | Persistence, encryption, authorization decisions, provider behavior                                  |
| `@insecur/token-signing`           | HS256 signed-token codec              | HS256/HMAC token encoding, signature verification, safe JSON object payload decoding                                                                                               | Claim validation, session composition, machine token semantics, root-key custody                     |
| `@insecur/auth`                    | Human authentication sessions         | WorkOS sealed session validation, User actor context, CLI ephemeral credentials, CSRF helpers for browser mutations                                                                | Effective Access, CLI commands, WorkOS hosted login UI, Machine Identity                             |
| `@insecur/access`                  | Effective Access Resolver             | Membership and Role expansion into Effective Access, Authorization Scope evaluation, scope-first authorization tests                                                               | Human authentication, Service Access, Protected Environment approval                                 |
| `@insecur/tenant-store`            | Tenant-Scoped Store                   | Scoped transaction Interface, tenant scope setting, RLS adapter contract, cross-tenant store tests                                                                                 | Business rules, authorization semantics, encryption, keyring construction                            |
| `@insecur/custody-contracts`       | Custody Contracts                     | plaintext-free data-key metadata, wrapped material shapes, tenant data-key readiness error                                                                                         | Encryption, decrypt, root-key access, persistence                                                    |
| `@insecur/crypto`                  | Keyring and Encryption Envelope       | tenant-bound key resolution, key versions, ciphertext identity binding, encrypt/decrypt entry points                                                                               | Secret lifecycle decisions, raw persistence, delivery policy, tenant-scoped DB access                |
| `@insecur/tenant-keyring`          | Runtime Tenant Keyring                | Runtime-only composition of tenant-scoped data-key metadata access with the crypto Keyring                                                                                         | Public routes, Secret Write, Injection Grant authorization, storage tables                           |
| `@insecur/audit`                   | Audit Event Writer                    | tenant-qualified metadata-only audit event shape, denied-attempt coverage, audit references                                                                                        | Audit export integrity, operation state, Sensitive Value storage                                     |
| `@insecur/release-gate`            | Security Evidence Bundle              | metadata-only release-gate bundle assembly, security check skeleton control IDs, fail-closed verdict derivation                                                                    | Scanner execution, human production signoff, hosted evidence portals                                 |
| `@insecur/secret-store-contracts`  | Secret Store Contracts                | public-safe Secret Write error class, ingress validation, text value validation, variable-key write validation                                                                     | Encryption, Secret Version append/current persistence, keyring access                                |
| `@insecur/secret-store`            | Secret Version Store                  | Secret Shape, Blind Secret Write, value validation, Secret Version append/current behavior, metadata-only outputs                                                                  | Runtime Injection, Promotion approval, raw SQL, provider sync                                        |
| `@insecur/runtime-injection-issue` | Runtime Injection Grant Issue         | public-safe grant issue path, issue/consume selector contracts, Injection Grant error class                                                                                        | Decrypt, Runtime delivery, keyring access                                                            |
| `@insecur/runtime-injection`       | Runtime Injection Grant Service       | one-use consume rules, variable-key scoped injection decisions, command output safety, Runtime-only decrypt delivery                                                               | CLI process spawning, child process trust, provider sync                                             |
| `@insecur/onboarding`              | Guided Organization Provisioning      | Personal Organization, Default Team, owner Membership, first Project, and non-protected development Environment creation                                                           | Public onboarding abuse controls, WorkOS authentication, production delivery                         |
| `@insecur/instance-bootstrap`      | Instance Bootstrap and operator claim | Instance posture, WorkOS-ready identity configuration, Bootstrap Operator Claim CAS, Instance Operator grant, first-Organization owner Membership                                  | WorkOS login UI, public signup, CLI wiring                                                           |
| `@insecur/operations`              | Operation Store                       | Operation IDs, idempotency keys, metadata-only status/progress/wait/retry/cancel state, CAS transitions, Sync Target Serialization lease rows and fencing tokens, audit references | Provider writes, authorization semantics, audit formatting/export, queue execution, Sensitive Values |

## Deferred Packages

These modules are intentionally documented but not scaffolded yet. Create the
package when its Interface is ready to be implemented and tested.

| Future package                   | Module                                   | Trigger                                                                            |
| -------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `@insecur/protected-change`      | Protected Change Orchestrator            | Protected Environment Draft Version, Promotion, Approval Request, or rollback work |
| `@insecur/sync`                  | Secret Sync                              | First provider sync lifecycle implementation                                       |
| `@insecur/provider-github`       | GitHub provider adapter                  | GitHub App installation or GitHub Actions secret sync work                         |
| `@insecur/provider-cloudflare`   | Cloudflare provider adapter              | Cloudflare Worker Secret sync work                                                 |
| `@insecur/storage-security-gate` | Storage Security Gate                    | Production delivery fail-closed readiness checks                                   |
| `@insecur/web-console`           | Human Approval Surface and management UI | Focused web UI work after API and CLI flows are verified                           |

## App Composition

The Worker tier is two capability-isolated deploys (ADR-0077). `apps/api` (the public **API Worker**)
owns transport, public route shape, Cloudflare bindings, caller authentication, and request
composition; it holds no keyring and forwards keyring-bound work to `apps/runtime` (the private
**Runtime Worker**) over the private `RUNTIME` Service Binding. `apps/runtime` is the sole holder of
`INSTANCE_ROOT_KEY_V1` and the only place decryption happens, exposed via the `RuntimeService` RPC
seam with no public routes. Both compose package Interfaces with resolved actor, tenant, and request
metadata; the shared composition glue (`http/*`, `auth/*`) lives in `packages/worker-kit`. Neither
deploy contains authorization branching, raw tenant data queries, encryption rules, Secret Version
append rules, or Runtime Injection Grant state machines in routes. The route → deploy table is
`docs/specs/deploy-route-inventory.md`, enforced by `pnpm conformance:topology`.

`packages/cli` owns local command parsing, safe input collection, local project
configuration, process spawning, human and JSON output formatting, and HTTP
client behavior. It should not own server-side authorization, Secret Version
storage, encryption, or provider delivery decisions.

## First Value Slice

The First Value Milestone should pass through these package Interfaces:

1. `@insecur/onboarding` provisions the Personal Organization and first
   Project shape.
2. `@insecur/access` proves the admitted User receives owner Organization
   Access through Membership and Role.
3. `@insecur/tenant-store` persists tenant metadata through scoped
   transactions.
4. `@insecur/custody-contracts` carries plaintext-free wrapped material and data-key metadata shapes.
5. `@insecur/crypto` wraps stored Sensitive Values with tenant/resource identity
   binding.
6. `@insecur/secret-store-contracts` keeps public-safe write validation off the crypto graph.
7. `@insecur/secret-store` creates a Blind Secret Write and appends the Secret
   Version.
8. `@insecur/runtime-injection-issue` issues a one-use Injection Grant without keyring access.
9. `@insecur/runtime-injection` consumes a one-use Injection Grant in Runtime.
10. `@insecur/tenant-keyring` composes tenant data-key metadata with the Runtime keyring.
11. `@insecur/audit` records metadata-only events for successful and denied
    attempts.
