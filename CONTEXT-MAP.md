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
- `docs/context-map.md` - package ownership and dependency direction.
- `docs/features.md` - delivered major functionality in one agent-readable map.
- `docs/specs/README.md` - current implementation entry point.
- `docs/specs/product-spec.md` - consolidated product state and ADR links.
- `docs/specs/architecture-groups.md` - architecture group ownership and seams.
- `docs/adr/README.md` - accepted decisions index.
- `docs/project-status.md` - current implementation status and next steps.

## App Contexts

| Path                      | Load when                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/api/CONTEXT.md`     | Working on the public API Worker: routes, request composition, bindings, API transport, hop token. |
| `apps/runtime/CONTEXT.md` | Working on the private Runtime Worker: the keyring/decrypt-egress deploy and `RuntimeService` RPC. |
| `apps/web/CONTEXT.md`     | Working on the metadata Web Console BFF, browser auth, or private API binding.                     |
| `apps/site/CONTEXT.md`    | Working on public marketing, docs, installers, legal pages, or error reference.                    |

## Package Contexts

| Path                                          | Module                                                           |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `packages/domain/CONTEXT.md`                  | Shared domain primitives and stable vocabulary shapes.           |
| `packages/token-signing/CONTEXT.md`           | Shared HS256/HMAC signed-token codec for auth modules.           |
| `packages/auth/CONTEXT.md`                    | Human authentication sessions and User actor context.            |
| `packages/machine-auth/CONTEXT.md`            | Machine Identity auth method exchange and OIDC trust matching.   |
| `packages/access/CONTEXT.md`                  | Effective Access Resolver and scope-first authorization.         |
| `packages/agent-attribution/CONTEXT.md`       | Agent harness detection and Agent Session attribution.           |
| `packages/app-connection/CONTEXT.md`          | App Connection lifecycle and provider credential custody.        |
| `packages/backup-restore/CONTEXT.md`          | Encrypted backup export, restore, and readiness evidence.        |
| `packages/tenant-store/CONTEXT.md`            | Tenant-Scoped Store and metadata isolation.                      |
| `packages/custody-contracts/CONTEXT.md`       | Plaintext-free custody and wrapped-material contracts.           |
| `packages/crypto/CONTEXT.md`                  | Keyring, Encryption Envelope, and Ciphertext Identity Binding.   |
| `packages/tenant-keyring/CONTEXT.md`          | Runtime-only tenant-backed Keyring composition.                  |
| `packages/audit/CONTEXT.md`                   | Audit Event Writer and metadata-only audit records.              |
| `packages/notifications/CONTEXT.md`           | Metadata-only notification envelopes and webhook subscriptions.  |
| `packages/high-assurance/CONTEXT.md`          | Operation-bound High-Assurance Challenge evidence.               |
| `packages/secret-store/CONTEXT.md`            | Secret Version Store and Blind Secret Write rules.               |
| `packages/secret-store-contracts/CONTEXT.md`  | Public-safe Secret Write validation and error contracts.         |
| `packages/runtime-injection-issue/CONTEXT.md` | Public-safe Injection Grant issue path and selector contracts.   |
| `packages/runtime-injection/CONTEXT.md`       | Runtime Injection Grant Service.                                 |
| `packages/onboarding/CONTEXT.md`              | Guided Organization Provisioning.                                |
| `packages/release-gate/CONTEXT.md`            | Security Evidence Bundle assembly and fail-closed verdicts.      |
| `packages/storage-security-gate/CONTEXT.md`   | Storage Security Gate metadata-only readiness verdict.           |
| `packages/instance-bootstrap/CONTEXT.md`      | Instance Bootstrap and Bootstrap Operator Claim.                 |
| `packages/operations/CONTEXT.md`              | Operation Store and Sync Target Serialization.                   |
| `packages/protected-change/CONTEXT.md`        | Protected promotion, rollback, and approval orchestration.       |
| `packages/delivery-policy/CONTEXT.md`         | Delivery Risk Policy Presets and delivery automation resolution. |
| `packages/secret-sync/CONTEXT.md`             | Secret Sync lifecycle and provider delivery adapters.            |
| `packages/worker-kit/CONTEXT.md`              | Shared Worker HTTP/auth/RPC composition glue.                    |
| `packages/observability/CONTEXT.md`           | Shared Sentry composition for Worker and browser runtimes.       |
| `packages/ui/CONTEXT.md`                      | Shared React component library for the site and the console.     |
| `packages/cli/CONTEXT.md`                     | CLI commands, local config, safe input, and child execution.     |
| `packages/local-store/CONTEXT.md`             | Local Mode machine root key custody and encrypted local store.   |
| `packages/preview-smoke/CONTEXT.md`           | Preview smoke harness assertions, probes, and deploy evidence.   |

Every package has a local `CONTEXT.md`. For `preview-smoke`, also read `package.json` and
`playwright.preview.config.ts`; it is test infrastructure rather than product code.

## Reading Rules

1. Start with the most local `CONTEXT.md` for the files you are touching. For an
   implementation-support package without one, use its README or `src/index.ts`, then load the
   owning domain context.
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
