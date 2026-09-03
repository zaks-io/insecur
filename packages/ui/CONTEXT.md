# @insecur/ui Context

Scoped context for agents working in `packages/ui`. This file is a
reading map, not an independent glossary.

## Role

This package owns the shared React component library used by `apps/site` and `apps/web`. One
concept gets one visual treatment here; surfaces do not invent a second one.

## Read First

- `../../docs/adr/0051-web-console-architecture.md`
- `../../docs/web-console-ux.md`
- `../../docs/brand/`

## Terms To Load

- `../../docs/context/glossary/terminology-rules.md`

## Adjacent Terms

- Route definitions and data loading live in `apps/web/CONTEXT.md` and `apps/site`.

## Owns

- Radix and CVA primitives: Button, Card, Badge, Input, Breadcrumbs, SwitcherMenu,
  ConsolePlaceholder, ThemeToggle.
- Layout shells: `SiteShell` for the public site, `ConsoleShell` for the console.
- Theme init script, storage key, and toggle.
- The `cn` helper and the shared Tailwind style layer.

## Does Not Own

- Routes, data loading, or any API call. Components take props.
- Product copy. Internal ids, slugs, and plumbing vocabulary never reach a label here.

## Conventions

- Size and spacing changes belong in the CVA variant, never at a call site.
- No emoji in any button, label, or badge.
- Interactive elements are differentiated with containers, labels, or accent color, never by
  looking recessed or disabled.
