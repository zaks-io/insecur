# ADR-0051: Web Console Architecture

Date: 2026-05-25

Status: Accepted

## Decision

The product web surface is a single tenant web console plus the CLI (ADR-0007), with insecur platform operations living on a separate Service Access surface, not a role-gated mode of the tenant console.

The tenant console is server-rendered with TanStack Start (React SSR) deployed on Cloudflare Workers (ADR-0002), styled with Tailwind and shadcn/ui under a strict Content Security Policy. The browser never talks to the API Worker directly. It talks only to the web Worker, which acts as a Backend-for-Frontend (BFF) and reaches the API Worker over a private Cloudflare Service Binding, not a public hop.

The BFF owns the human session (HttpOnly, SameSite cookie, CSRF protection, session rotation per `docs/architecture.md`). When it calls the API Worker it mints a short-lived, scoped access token for that request. No bearer token is ever placed in browser-reachable storage. The API Worker authorizes that token through the single Effective Access Resolver (ADR-0034) the same way it authorizes the CLI, agents, and CI, so the web is one more caller of a caller-agnostic boundary, not a privileged path.

The Service Access surface is a distinct deployment with its own auth audience. Service Access can decrypt Sensitive Metadata but its token is constructed so it can never carry Secret Reveal, Secret Delivery, Sensitive Value, or approval scope (see **Secret Reveal** in [docs/context/glossary/runtime-injection.md](../context/glossary/runtime-injection.md), **Secret Delivery** in [docs/context/glossary/sensitive-data-safety.md](../context/glossary/sensitive-data-safety.md), and ADR-0019). Keeping it a separate deploy means the cross-organization operator data model never enters the tenant BFF's codebase or attack surface. The customer-org Metadata Viewer Role stays in the tenant console; Instance Operator administration sits with or beside the Service Access surface.

## Options Considered

- **SPA calling the API directly with a browser-held bearer token.** Rejected. It places a bearer token in browser-reachable storage, widening token-theft and XSS blast radius, and contradicts the architecture requirement that bearer tokens appear only in a server-side Authorization header and that no Sensitive Values or tokens live in the browser. It also creates a second caller shape at the API boundary.
- **One console with role-gated operator views.** Rejected. It keeps cross-organization Service Access tooling inside the tenant application's codebase and attack surface and turns the Service Access exclusions (no reveal, no delivery, no approval) into role conditionals in shared code rather than a structural deploy-and-token boundary.
- **Separate per-surface apps beyond web and CLI (desktop, native).** Rejected at the topology decision: one tenant web console plus the CLI, with mobile a later thin Capacitor wrapper over the same responsive surface, not a separate approval path.
- **Tenant console (SSR on Workers) + BFF via Service Binding + short-lived caller-agnostic token; Service Access as a separate surface.** Accepted. It keeps a single authorization boundary, keeps tokens out of the browser, and makes the operator trust boundary structural.

## Consequences

- The browser holds a session cookie, never an API bearer token. Token compromise requires compromising the BFF, not the client.
- The API Worker enforces one authorization path for every caller, so web-specific scope limits (including the no-reveal boundary in ADR-0052) are expressed as token scope, not UI logic.
- The Service Binding is private worker-to-worker; the API Worker is not publicly reachable by the browser.
- Two deploy targets for human surfaces (tenant console, Service Access surface) plus the API Worker. The operator surface carries no reveal, delivery, value, or approval scope by construction.
- The live approval inbox transport (Server-Sent Events; the Durable Object fan-out option is deferred with Durable Objects past V1) and other in-console UX are reversible design choices below this ADR, not part of the fixed architecture.
