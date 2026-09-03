# Packages

This directory contains the 33 workspace packages for insecur. The ownership and dependency map
lives in [`../docs/context-map.md`](../docs/context-map.md); the glossary index lives in
[`../CONTEXT.md`](../CONTEXT.md).

Packages are cut around domain modules and capability boundaries, not database tables or route
groups. Read a package's `CONTEXT.md` first when it exists, then its README and public exports.

## Package index

| Package                            | Responsibility                                                     |
| ---------------------------------- | ------------------------------------------------------------------ |
| `@insecur/access`                  | Effective Access resolution and scope-first authorization          |
| `@insecur/agent-attribution`       | Agent session attribution and principal-chain metadata             |
| `@insecur/app-connection`          | Provider connection lifecycle and credential custody orchestration |
| `@insecur/audit`                   | Metadata-only audit events and tamper-evident exports              |
| `@insecur/auth`                    | Human and CLI session authentication contracts                     |
| `@insecur/backup-restore`          | Encrypted backup export, restore, and readiness evidence           |
| `@insecur/cli`                     | The `insecur` CLI, Local Mode, and HTTP client composition         |
| `@insecur/crypto`                  | Keyring, encryption envelopes, and ciphertext binding              |
| `@insecur/custody-contracts`       | Plaintext-free public custody contracts                            |
| `@insecur/delivery-policy`         | Delivery risk policy presets and automation resolution             |
| `@insecur/domain`                  | Shared domain primitives and stable vocabularies                   |
| `@insecur/high-assurance`          | Operation-bound step-up challenge evidence                         |
| `@insecur/instance-bootstrap`      | One-time instance bootstrap and operator claim                     |
| `@insecur/local-store`             | Encrypted machine-local custody for Local Mode                     |
| `@insecur/machine-auth`            | Machine Identity OIDC and short-lived credential exchange          |
| `@insecur/notifications`           | Metadata-safe approval notification ports                          |
| `@insecur/observability`           | Allowlisted telemetry, traces, and query instrumentation           |
| `@insecur/onboarding`              | Guided organization and first-project provisioning                 |
| `@insecur/operations`              | Durable operation state and sync-target serialization              |
| `@insecur/preview-smoke`           | Hosted preview proof suite and metadata-only evidence              |
| `@insecur/protected-change`        | Protected promotion, rollback, and approval orchestration          |
| `@insecur/release-gate`            | Security Evidence Bundle assembly and verdicts                     |
| `@insecur/runtime-injection-issue` | Public-safe Runtime Injection grant issue contracts                |
| `@insecur/runtime-injection`       | Runtime Injection grant policy and consumption                     |
| `@insecur/secret-store-contracts`  | Public-safe Blind Secret Write contracts                           |
| `@insecur/secret-store`            | Secret Version lifecycle and Blind Secret Write rules              |
| `@insecur/secret-sync`             | Alpha Secret Sync planning and GitHub/Cloudflare provider adapters |
| `@insecur/storage-security-gate`   | Production storage-readiness verdict and enforcement contracts     |
| `@insecur/tenant-keyring`          | Runtime-only tenant-backed Keyring composition                     |
| `@insecur/tenant-store`            | Tenant-scoped persistence and forced-RLS adapters                  |
| `@insecur/token-signing`           | Shared HMAC token codec                                            |
| `@insecur/ui`                      | Shared web and site visual primitives                              |
| `@insecur/worker-kit`              | Shared Worker HTTP, auth, and RPC composition                      |

## Package documentation

Domain package READMEs document ownership, dependencies, exclusions, and test seams. Local
`CONTEXT.md` files route agents to the governing glossary slices and adjacent modules. The complete
package graph and dependency direction remain owned by
[`../docs/context-map.md`](../docs/context-map.md), so do not infer architecture from this index
alone.
