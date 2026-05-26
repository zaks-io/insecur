# insecur

A multi-tenant secrets manager for developers and agents working in the Cloudflare + GitHub Actions stack, with Vercel kept as an additive provider adapter behind the same port model. The first wedge is replacing plaintext local secret files with diskless development secret use through the `insecur` CLI; the production path adds Cloudflare Workers, Hyperdrive-backed Neon Postgres with Row-Level Security, envelope encryption with WebCrypto, OAuth app connections, runtime injection, and provider sync without revealing plaintext secrets by default.

insecur's v1 product focus is narrow: store secrets securely as the source of truth, replace `.env` files for local development with just-in-time runtime injection, sync secrets to Cloudflare and GitHub when those platforms need native secrets, and keep developers and agents away from steady-state plaintext secret files. The Vercel sync adapter is deferred past V1.

> Yes, the name is on purpose.

## Layout

```
apps/
  worker/   Cloudflare Worker API composition
packages/
  domain/             shared domain primitives and stable vocabulary shapes
  access/             Effective Access Resolver
  tenant-store/       Tenant-Scoped Store and RLS adapter contract
  crypto/             Keyring and Encryption Envelope
  audit/              Audit Event Writer
  secrets/            Secret Version Store and Blind Secret Write rules
  runtime-injection/  Runtime Injection Grant Service
  onboarding/         Guided Organization Provisioning
  cli/                Node CLI for runtime injection and agent-safe operations
```

The agent context routing map lives in [CONTEXT-MAP.md](CONTEXT-MAP.md). The
package ownership map lives in [docs/context-map.md](docs/context-map.md).
`CONTEXT.md` remains the source of truth for domain language.

## Quick start

See [docs/setup.md](docs/setup.md).

Start with [docs/specs/README.md](docs/specs/README.md). The canonical product spec lives in
[docs/specs/product-spec.md](docs/specs/product-spec.md), and autonomous implementation seams live
in [docs/specs/agent-workstreams.md](docs/specs/agent-workstreams.md). The current customer
validation and product-excellence plan lives in [docs/customer-validation.md](docs/customer-validation.md).

The older area docs still hold useful detail: [docs/architecture.md](docs/architecture.md),
[docs/cli-and-sync.md](docs/cli-and-sync.md),
[docs/protected-change-orchestration.md](docs/protected-change-orchestration.md),
[docs/storage-security-gate.md](docs/storage-security-gate.md),
[docs/security-runbooks-and-release-gates.md](docs/security-runbooks-and-release-gates.md), and
[docs/security-plan.md](docs/security-plan.md). Architectural decisions are indexed in
[docs/adr/README.md](docs/adr/README.md).

## Production V1 Boundary

The first production release is not a dev-only secrets store or a single-owner shortcut. V1 targets Small-Group Production: personal projects and relatively small trusted groups using production-quality secret protection, with an Enterprise-Ready Model underneath so later enterprise support does not require a tenant, authorization, audit, or key-boundary refactor.

V1 is split into two ordered milestones: **First Value** proves provider-free Diskless Development Secret Use for non-protected development secrets, and **Production Delivery** adds protected environments, provider sync, machine access, policy-gated approval UX, audit/export, runbooks, and the Storage Security Gate.

First Value is also the customer-validation proof. The first beachhead is agent-heavy solo
developers and small trusted teams shipping through Cloudflare Workers and GitHub Actions. The
proof loop should be short enough to show the product's core idea directly: create or generate one
development secret, run one command with Runtime Injection, and never create a plaintext `.env`
file for an agent to read.

Delivery risk is exposed through simple presets backed by versioned policy infrastructure. Guided onboarding applies Balanced automatically without a first-run preset picker; users may later choose Strict or Automation-Friendly without being asked to design a custom policy. Balanced allows development automation by default, while preview automation requires opt-in on each non-protected preview environment. Automation-Friendly removes that per-environment preview opt-in step, but still only executes already-configured delivery paths. Broadening automation requires Human Approval Surface step-up, while tightening risk stays lower-friction and audited. All presets keep protected production approval and High-Assurance Challenges in the Human Approval Surface.

Hosted onboarding creates a Personal Organization, owner Membership, first Project, and non-protected development Environment for an admitted user so the first session can focus on replacing local secret files: creating and using a development secret through local Runtime Injection without provider setup. The copyable verifier lives in [examples/first-value-proof](examples/first-value-proof). That Personal Organization can grow into a small-team Organization through Invitations and Memberships.

The current unsafe scaffold is disposable learning code, not a supported product mode or evidence of intended product behavior. V1 work should replace or delete scaffold surfaces rather than preserve them behind warnings, compatibility shims, or unsafe deployment flags.

Provider secrets are derived delivery targets, not the source of truth. Rotation and changes start in insecur, then flow through audited sync or runtime injection paths.

Production Secret Delivery and Secret Sync are blocked until the [Storage Security Gate](docs/storage-security-gate.md) passes. The gate verifies the full storage baseline: root key material outside the Postgres metadata store, tenant data keys, key versions, encrypted Provider Credentials and Sensitive Metadata, ciphertext identity binding, tenant-scoped metadata storage, and no plaintext persistence.

## Build Order

- **First Value** — guided Personal Organization provisioning, first Project, non-protected development Environment, service-generated Blind Secret Write, `run --variable-key`, Diskless Development Secret Use, and copyable First Value Proof
- **Production foundation** — tenant-first schema, organization/project memberships, role enforcement, WorkOS AuthKit, tenant-qualified routes, organization/project data keys, key versions, protected promotion/rollback, and security gates
- **V1 machine access** — machine identities and GitHub Actions OIDC federation for short-lived CI access
- **V1 approval UX** — Human Approval Surface for protected gates plus Delivery Risk Policy Presets for explicit non-protected preview/development automation
- **V1 delivery** — OAuth app connections and sync engines for GitHub and direct Cloudflare Worker secrets, plus profile-based `insecur run` for deploy and local command injection
- **Post-v1 hardening** — Vercel sync, focused UI, deeper rotation automation, broader recovery drills, and operational polish
