# ADR-0083: One Visual System Across Site, Docs, and Console, Light and Dark

Date: 2026-07-09

Status: Accepted

Supersedes the visual direction embedded in ADR-0078's adoption notes and
`docs/web-console-ux.md` §Visual Direction (the stark ink-on-paper brutalism: 2px ink rules,
Archivo Black display type, light-only). The ADR-0078 content-free UI boundary (presentational
components in `@insecur/ui`, all copy passed in by callers) is unchanged and remains in force.

## Decision

All public and authed surfaces — `apps/site` (marketing, docs, legal, error reference) and
`apps/web` (pre-auth pages and the tenant console) — render one visual system from `@insecur/ui`,
in the register of modern developer-tool minimalism (Vercel-adjacent):

- **Type**: self-hosted Geist Sans and Geist Mono (Fontsource; no font CDN on first paint).
  Headings are tight-tracked semibold sans; there is no separate display face. `--font-display`
  remains defined and aliases the sans stack.
- **Color**: neutral white/near-black surfaces with hairline `--border` rules and near-square
  corners (`--radius: 0.25rem`, a bare edge break; the squared-off redaction block is the brand
  mark). One brand accent survives: `--signal` red, used sparingly (the wordmark
  point, one accent word, warning treatments). All component color goes through semantic shadcn
  tokens; raw palette values are a defect.
- **Schemes**: light and dark are both first-class. Dark mode is class-based (`.dark` on `<html>`),
  stamped before first paint by `THEME_INIT_SCRIPT` (localStorage preference, falling back to
  `prefers-color-scheme`), toggled by the shared `ThemeToggle`. Under the console's strict CSP the
  inline init script carries the per-request nonce. Never hand-write `dark:` color overrides in
  app code; the semantic tokens carry both schemes.
- **Legacy aliases**: `--color-ink`, `--color-paper`, and `--color-signal` remain defined as
  theme-aware aliases (foreground / background / signal) so unswept call sites stay correct in
  both schemes, but new code uses semantic tokens only. Remaining `ink`/`paper` class usages are
  migration debt, not a second palette.
- **One chrome**: `SiteHeader`/`SiteFooter`/`SiteNavLink` provide the sticky translucent header
  and footer for every public page, and `ConsoleShell`/`ConsoleTopbar` reuse the same header
  language for the console, so the `insecur.cloud` → `app.insecur.cloud` hop reads as one product.
  The site header links to the console (Sign in) and the console topbar links back to the docs.

## Why

The site, docs, legal pages, and console had drifted into a patchwork: a brutalist marketing skin,
shadcn defaults underneath it (rounded, dark-variant classes) contradicting the light-only token
set, and no dark mode anywhere. A secrets product's console is a long-session developer tool;
developer tooling without dark mode reads as unfinished, and two temperaments across one domain
boundary read as two products.

## Consequences

- `docs/brand/voice.md` §House style and `docs/web-console-ux.md` §Visual Direction now describe
  this system; the brutalist reference is retired.
- The wordmark stays the truncated lowercase "insecur", now closed by a signal-red point instead
  of being set in Archivo Black.
- Copy voice (`docs/brand/messaging.md`, `docs/brand/voice.md`) is unaffected.
