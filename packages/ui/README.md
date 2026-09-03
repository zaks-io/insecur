# @insecur/ui

Shared React component library for the marketing site and the tenant console.

One visual system across `apps/site` and `apps/web`. A concept gets one treatment here, not a
second one per surface.

## Owns

- Primitives built on Radix and CVA variants: Button, Card, Badge, Input, Breadcrumbs,
  SwitcherMenu, ConsolePlaceholder, ThemeToggle.
- Layout shells: `SiteShell` for the public site, `ConsoleShell` for the authenticated console.
- Theme handling: the pre-hydration init script, storage key, and toggle.
- The `cn` class merge helper and the shared Tailwind style layer.

## Consumes

- `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`.
- `@fontsource-variable/geist` and `geist-mono`.

## Does Not Own

- Route definitions, data loading, or any API call. Components take props.
- Product copy. Internal ids, slugs, and plumbing vocabulary must not reach a label here.

## Interface Tests

Covered through the consuming apps' route tests. A component's variants are the test surface;
size and spacing changes belong in the CVA variant, never at a call site.

## Dependency Rule

This package must not import any `@insecur/*` package. It is presentation only and never
receives a Sensitive Value.
