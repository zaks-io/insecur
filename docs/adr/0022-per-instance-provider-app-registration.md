# ADR-0022: Per-Instance Provider App Registration

Date: 2026-05-24

Status: Accepted

App-install and OAuth **Connection Methods** resolve their client identity and callback from a **Provider App Registration** owned by the **Instance**, not from a single insecur-owned provider app shared across all Instances. Each **Instance** registers its own GitHub App and Vercel Integration; a **Hosted Instance** such as insecur.cloud and a **Self-Hosted Instance** use the same mechanism and differ only in who registers the provider app and owns its credentials. Scoped-token methods such as Cloudflare `scoped-api-token` have no **Provider App Registration**.

This resolves a collision between ADR-0020 (a **Hosted Instance** and a **Self-Hosted Instance** run the same runtime and codebase) and ADR-0006/ADR-0011 (GitHub App installations and Vercel Integration OAuth). GitHub Apps and Vercel Integrations are bound to a publisher-registered app with a fixed, app-owned callback URL and client credentials. A single central insecur-owned provider app cannot serve a **Self-Hosted Instance** running on a customer-controlled domain, because that Instance needs its own callback and client identity.

## Considered Options

- One central insecur-owned GitHub App and Vercel Integration for every Instance. Rejected: the publisher-owned fixed callback and client identity cannot point at customer-controlled self-hosted domains, it couples every tenant's provider access to insecur's app, and it contradicts the ADR-0020 same-runtime posture.
- Special-case hosted and self-hosted with separate connection code paths. Rejected: divergent code paths drift over time and re-introduce the "self-host is a different product" model ADR-0020 rejected.

## Consequences

A **Self-Hosted Instance** setup includes a one-time provider-app registration step for each app-install or OAuth provider it wants to use; this is documented onboarding, not a code fork. A **Provider App Registration** is **Instance Configuration**. A **Provider Authorization Callback** returns to the callback of the **Instance**'s own **Provider App Registration**. The app private key and OAuth client secret are **Instance**-owned secrets; rotating them is an **Instance**-level operation that affects every **App Connection** built on that registration, distinct from per-connection **Credential Reauthorization**. insecur.cloud is just an **Instance** whose provider apps happen to be registered and owned by insecur, so hosted and self-hosted keep one code path.
