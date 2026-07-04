# @insecur/site Context

Scoped context for agents working in `apps/site`. This file is a reading map, not an independent
glossary. Authoritative term definitions live in the per-domain slices under
`../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task needs.

## Role

The **Public Site Worker** (`insecur-site`, ADR-0078) serves the public marketing, mechanism, legal,
and security-posture surface for `insecur.cloud` and `www.insecur.cloud`. It is deliberately **not a
BFF**: it owns no auth session, holds no database/Hyperdrive binding, no keyring
(`INSTANCE_ROOT_KEY_V1`), and no API or Runtime Service Binding. Its presentational primitives come
from the content-free `@insecur/ui` package. Its only permitted `@insecur/*` dependencies are
`@insecur/ui` and capability-free `@insecur/observability` (enforced by dependency-cruiser,
`pnpm conformance:site-boundary`).

The Web Console BFF (`apps/web`) remains the authenticated product surface (for example
`app.insecur.cloud`); the Public Site is a separate deploy with no product-control-plane capability.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/adr/0078-public-site-worker.md`
- `../../docs/specs/product-spec.md` (§2 deploy topology, Public Site bullet)
- `../../docs/specs/deploy-route-inventory.md`
- `../../docs/brand/messaging.md`

## Terms To Load

- Public Site Worker
- Web Console BFF
- First Value Proof

## Owns

- Public route shape and page composition for `insecur.cloud`.
- Marketing, mechanism, legal, and security-posture page content (copy lives here, not in `@insecur/ui`).
- Transport-level security response headers for public pages.
- Composition of `@insecur/ui` presentational primitives into pages.

## Does Not Own

- Any auth session, cookie, or CSRF handling (Web BFF only).
- Any database, Hyperdrive, keyring, API, or Runtime binding.
- Design tokens or shared components (owned by `@insecur/ui`).
- Legal wording review or publication gating (requires human legal/security review before go-live).
- The site deploy workflow and production publish gate (follow-up tickets).
