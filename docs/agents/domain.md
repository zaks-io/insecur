# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`docs/specs/README.md`** for the current implementation entry point.
- **`docs/specs/product-spec.md`** for the consolidated product state and ADR trace links.
- **`docs/specs/agent-workstreams.md`** when planning or taking an implementation slice.
- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** only for ADRs linked from the spec section that touches the area you're about to
  work in.

`CONTEXT.md` starts with a Navigation section. Use that map first when you know the domain area but not the exact term.

If any of these files don't exist, proceed silently. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a single-context repo:

```text
/
├── CONTEXT.md
├── docs/specs/
│   ├── product-spec.md
│   └── agent-workstreams.md
├── docs/adr/
│   ├── 0001-example-decision.md
│   └── 0002-example-decision.md
└── apps/
```

## Use the glossary's vocabulary

When your output names a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use, or there's a real gap to note for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (example decision), but worth reopening because..._
