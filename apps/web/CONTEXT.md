# @insecur/web Context

Scoped context for agents working in `apps/web`. This file is a reading map, not an independent
glossary.

## Role

The **Web Console BFF** (`insecur-web`, ADR-0051/0052) is the only deploy the browser talks to. It
owns the human session cookie (HttpOnly, SameSite, CSRF) and calls the **API Worker** over the
private `API` Service Binding with a per-request `insecur-api`-audience scoped token. It holds **no
keyring**, **no Hyperdrive binding**, and performs **no decrypt**.

Pre-auth admission resolution uses the same private `RUNTIME` admission seam as the API edge
(ADR-0077); all product API calls go to `insecur-api` only.

## Read First

- `../../docs/adr/0051-web-console-architecture.md`
- `../../docs/adr/0052-web-no-reveal-boundary-and-management-parity.md`
- `../../docs/specs/deploy-route-inventory.md`
- `../api/CONTEXT.md`

## Owns

- TanStack Start SSR shell and BFF routes/pages.
- Browser session cookie ownership and CSRF primitives consumption.
- Minting short-lived scoped tokens for the API hop (never exposed to the browser).
- Strict Content Security Policy response headers on HTML responses.

## Does Not Own

- Public `/v1/*` API routes (API Worker).
- Keyring, decrypt, or tenant DB I/O (Runtime Worker).
- Human Approval Surface feature UX beyond the scaffold proof route (`INS-86`).
