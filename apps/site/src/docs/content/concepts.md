---
title: Core concepts
description: The domain vocabulary, organizations, projects, environments, secrets, grants, policies, and how the pieces relate.
section: Concepts
order: 2
---

# Core concepts

These are the nouns the product, the CLI, and the API all share. Every id you will see is an opaque resource id; names are display metadata, never addresses.

## Tenancy

**Organization.** The tenant boundary. It owns projects, memberships, machine identities, connections, audit history, and the tenant-bound encryption keys. Solo users get a personal organization created automatically on first `insecur init` or during web onboarding.

**Membership and roles.** Access always flows from an explicit membership with a role (owner, admin, developer, metadata viewer, approval, read-only). Roles grant authorization scopes, and every route checks scopes. There is no actor-type special-casing: a human, an agent session, and a machine identity all pass through the same authorization.

**Project.** Belongs to one organization. Holds environments.

**Environment.** Belongs to one project. The load-bearing property is `isProtected`. Development environments are non-protected: writes go live immediately and injection works from your machine. Staging and production are protected: changes require promotion and approval, and delivery requires environment-bound machine credentials. Protection is a property, not a naming convention.

## Secrets

**Secret and variable key.** A secret is identified within an environment by its variable key, the environment variable name it will be injected as, like `DATABASE_URL`.

**Blind write.** `insecur secrets set` sends a value in; no response ever contains it. You can also have the service generate the value so no human ever sees it.

**Versions.** Writes append versions; metadata records who set what and when. Non-protected writes become current immediately. Protected writes create draft versions that wait for [promotion and approval](/docs/approvals). `insecur secrets versions <secret-id>` lists version metadata.

**Reveal does not exist for protected environments.** There is no command or console view that returns a protected value. This is intentional and permanent.

## Using secrets

**Runtime injection.** The only delivery path for development use: a value is decrypted inside the private runtime service and placed into the environment of one child process via `insecur run`.

**Injection grant.** Every run gets a fresh grant naming exact secret bindings. Lifecycle: issued, then consumed, expired, or revoked. One use, short-lived, always audited.

**Run policy.** A saved, immutable description of a repeatable run: exact secret bindings, the command, optionally a command fingerprint. Create one with `insecur run-policies create` and run it by profile. Bindings are always exact; there is no wildcard or prefix selection anywhere in the product.

**Machine identity.** An organization-owned actor for CI and deploy workloads. It exchanges workload auth (GitHub Actions OIDC, or an environment deploy key) for short-lived tokens. Protected-environment delivery is machine-only.

**App connection.** An organization-owned link to a provider (GitHub app installation, Cloudflare scoped token) with encrypted credentials, used for provider setup and, later, secret sync. Status output is metadata; provider credentials are never returned.

## Accountability

**Agent attribution.** Sessions carry who is acting: a human directly, a derived agent child session, a registered agent harness, or a tag-only attribution. `insecur whoami` shows the resolved tier; audit events carry the principal chain. See [Using insecur with coding agents](/docs/agents).

**Operations.** Long-running or gated work returns an operation id. `insecur operations get`, `wait`, and `cancel` read and control it. When a step-up gate blocks an action, the operation id is your handle to poll while a human clears it.

**Audit events.** Metadata-only, tenant-scoped, filterable, exportable with signed manifests. See [Audit and verification](/docs/audit).

## Where configuration lives

`.insecur.json` in your project directory pins host, organization, project, environment, and profile by opaque id. It is committed and non-secret. Flags override environment variables, which override the project file, which overrides profile defaults; the [environment variables reference](/docs/reference/environment-variables) lists the variables.

## Related

- [How insecur works](/docs/how-it-works)
- [Security model](/docs/security-model)
- [CLI reference](/docs/cli)
