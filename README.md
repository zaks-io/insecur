# insecur

A multi-tenant secrets manager for the Cloudflare + Vercel + GitHub Actions stack. Cloudflare Workers, Hyperdrive-backed Neon Postgres with Row-Level Security, envelope encryption with WebCrypto, OAuth app connections, runtime injection, and provider sync without revealing plaintext secrets by default.

insecur's v1 product focus is narrow: store secrets securely as the source of truth, sync them to Cloudflare, Vercel, and GitHub when those platforms need native secrets, and inject them just-in-time for deploys or local commands so developers and agents do not need local secret files.

> Yes, the name is on purpose.

## Layout

```
apps/
  worker/   Cloudflare Worker API (target: Hono + Hyperdrive-backed Postgres)
packages/
  cli/      Node CLI for runtime injection and agent-safe operations
```

## Quick start

See [docs/setup.md](docs/setup.md).

The design notes live in [docs/architecture.md](docs/architecture.md), the CLI/sync plan lives in [docs/cli-and-sync.md](docs/cli-and-sync.md), protected change orchestration lives in [docs/protected-change-orchestration.md](docs/protected-change-orchestration.md), the Storage Security Gate lives in [docs/storage-security-gate.md](docs/storage-security-gate.md), security runbooks/release gates live in [docs/security-runbooks-and-release-gates.md](docs/security-runbooks-and-release-gates.md), and the security planning checklist lives in [docs/security-plan.md](docs/security-plan.md). Architectural decisions are indexed in [docs/adr/README.md](docs/adr/README.md).

## Production V1 Boundary

The first production release is not a dev-only secrets store or a single-owner shortcut. V1 targets Small-Group Production: personal projects and relatively small trusted groups using production-quality secret protection, with an Enterprise-Ready Model underneath so later enterprise support does not require a tenant, authorization, audit, or key-boundary refactor.

V1 is split into two ordered milestones: **First Value** proves provider-free non-protected development Secret Use, and **Production Delivery** adds protected environments, provider sync, machine access, policy-gated approval UX, audit/export, runbooks, and the Storage Security Gate.

Delivery risk is exposed through simple presets backed by versioned policy infrastructure. Guided onboarding applies Balanced by default; users may later choose Strict or Automation-Friendly without being asked to design a custom policy during first use. Balanced allows development automation by default, while preview automation requires opt-in on each non-protected preview environment. Broadening automation requires Human Approval Surface step-up, while tightening risk stays lower-friction and audited. All presets keep protected production approval and High-Assurance Challenges in the Human Approval Surface.

Hosted onboarding creates a Personal Organization, owner Membership, first Project, and non-protected development Environment for an admitted user so the first session can focus on a provider-free First Value Proof: creating and using a secret through local Runtime Injection without provider setup. The copyable verifier lives in [examples/first-value-proof](examples/first-value-proof). That Personal Organization can grow into a small-team Organization through Invitations and Memberships.

The current unsafe scaffold is disposable learning code, not a supported product mode or evidence of intended product behavior. V1 work should replace or delete scaffold surfaces rather than preserve them behind warnings, compatibility shims, or unsafe deployment flags.

Provider secrets are derived delivery targets, not the source of truth. Rotation and changes start in insecur, then flow through audited sync or runtime injection paths.

Production Secret Delivery and Secret Sync are blocked until the [Storage Security Gate](docs/storage-security-gate.md) passes. The gate verifies the full storage baseline: root key material outside the Postgres metadata store, tenant data keys, key versions, encrypted Provider Credentials and Sensitive Metadata, ciphertext identity binding, tenant-scoped metadata storage, and no plaintext persistence.

## Build Order

- **First Value** — guided Personal Organization provisioning, first Project, non-protected development Environment, service-generated Blind Secret Write, `run --secret-name`, and copyable First Value Proof
- **Production foundation** — tenant-first schema, organization/project memberships, role enforcement, WorkOS AuthKit, tenant-qualified routes, organization/project data keys, key versions, protected promotion/rollback, and security gates
- **V1 machine access** — machine identities and GitHub Actions OIDC federation for short-lived CI access
- **V1 approval UX** — Human Approval Surface for protected gates plus Delivery Risk Policy Presets for explicit non-protected preview/development automation
- **V1 delivery** — OAuth app connections and sync engines for Vercel, GitHub, and direct Cloudflare Worker secrets, plus profile-based `insecur run` for deploy and local command injection
- **Post-v1 hardening** — focused UI, deeper rotation automation, R2 backups, restore tests, and operational polish
