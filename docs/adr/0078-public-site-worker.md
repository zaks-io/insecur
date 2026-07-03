# ADR-0078: Public Site Worker Separate From Web Console BFF

Date: 2026-07-01

Status: Accepted

## Decision

insecur.cloud is served by a separate **Public Site Worker** (`apps/site`, `insecur-site`), not by the Web Console BFF. The Public Site Worker owns public marketing, mechanism, legal, and lightweight security-posture pages for `insecur.cloud` and `www.insecur.cloud`; the Web Console BFF remains the authenticated product app surface, such as `app.insecur.cloud`.

The Public Site Worker uses the same frontend stack family as the Web Console BFF: TanStack Start, React, Tailwind, and shared shadcn-based components from a presentational, content-free `@insecur/ui` package. It is deliberately not a BFF: it has no auth session ownership, no database or Hyperdrive binding, no Keyring or root-key binding, and no API or Runtime Service Binding. Its dependency boundary is enforced with dependency-cruiser so the public site cannot grow a production dependency path into product-control-plane packages. Production source in `@insecur/site` may import only `@insecur/ui` from the `@insecur/*` workspace, and production source in `@insecur/ui` may import no `@insecur/*` packages.

Public-site feature flags and A/B testing are expected later, but the mechanism is not decided by this ADR.

## Options Considered

- **Host the public site inside `apps/web`.** Rejected. It would put externally churny public marketing/legal pages in the same deploy and dependency graph as the session-holding product BFF, making it too easy for public-site work to accrete auth, API, or control-plane access.
- **Build an ultra-static Worker outside the Web stack.** Rejected. That looked simpler but would make style, component, and layout reuse harder, and would create a second frontend system to maintain.
- **Separate Public Site Worker with shared UI primitives.** Accepted. It keeps the marketing/legal surface independently deployable and easy to change while preserving one frontend design system and a hard no-control-plane boundary.

## Consequences

- `apps/site` may serve landing, mechanism, legal terms, privacy, and an open-security posture page. The security page should communicate the intended security posture, threat model, and verification path at a high level, then link to the public code and threat-model/security-design material once those are public. It should not replace the governing ADRs, specs, or threat model, and it must not overclaim capabilities that have not shipped.
- The primary Public Site call to action is product use through the **First Value Proof**: a copyable, static terminal demo using the real CLI to initialize, save or generate a development secret, and use it through Runtime Injection in a small command or mock service. The Public Site must not run browser-executed demos, hosted sandboxes, or browser-side secret workflows for this initial scope. Security design, source links, and legal pages are important but secondary to getting testers to run the product.
- Pricing is deferred during the tester phase until there is real charging intent.
- Legal terms and privacy copy live as Public Site content under `apps/site/content/legal/`. They are not generated from product specs, ADRs, or `@insecur/ui`, and they require legal/publication review before going public.
- `@insecur/ui` owns Tailwind tokens, shadcn components, and branded layout primitives only. Routes, marketing copy, legal text, loaders, auth/session logic, analytics, experiments, and product API types stay outside the package.
- Public GitHub links may appear on the Public Site once the repository is public.
- The Public Site has independent deploy paths: a local CLI script for deploying the current checkout and a GitHub Actions workflow. Preview deploys route `preview.insecur.cloud` to `insecur-site-preview`; production deploys route `insecur.cloud` and `www.insecur.cloud` to `insecur-site`. Production deploy is manual-only for now; do not auto-publish site production on every `main` push until legal and security publication gates are settled. The shared preview workflow may also deploy API/Web preview Workers on their own preview subdomains, but this ADR owns only the Public Site Worker boundary.
