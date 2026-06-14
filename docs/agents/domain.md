# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`docs/agents/repo-navigation.md`** for the fast map of status docs, specs, package owners, and
  agent workflows.
- **`CONTEXT-MAP.md`** at the repo root to choose the relevant local context file.
- **`docs/specs/README.md`** for the current implementation entry point.
- **`docs/specs/product-spec.md`** for the consolidated product state and ADR trace links.
- **`docs/specs/agent-workstreams.md`** when planning or taking an implementation slice.
- **The local `CONTEXT.md`** named by `CONTEXT-MAP.md` for the package or app being touched.
- **`CONTEXT.md`** at the repo root: the glossary index. It routes to the per-domain definition
  slices under `docs/context/glossary/`. Load only the slice your task needs.
- **`docs/adr/`** only for ADRs linked from the spec section that touches the area you're about to
  work in.

Root `CONTEXT.md` is an index, not a glossary. Use package and app context files first for scope,
then load the exact glossary slice they name. Load `docs/context/relationships.md`,
`docs/context/glossary/terminology-rules.md`, or `docs/context/dialogue.md` only when you need
cross-term structure, disambiguation, or usage examples.

If any of these files don't exist, proceed silently. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a multi-context repo with a glossary index, per-domain definition slices, and scoped
app/package reading maps:

```text
/
├── CONTEXT-MAP.md
├── CONTEXT.md                       # glossary index (routing table, no definitions)
├── docs/context/
│   ├── relationships.md             # how terms relate (load on demand)
│   ├── dialogue.md                  # worked usage examples (load on demand)
│   └── glossary/
│       ├── crypto-storage-audit.md  # one per-domain definition slice
│       ├── ...
│       └── terminology-rules.md     # cross-cutting disambiguation rules
├── apps/
│   ├── api/
│   │   └── CONTEXT.md
│   └── runtime/
│       └── CONTEXT.md
├── packages/
│   ├── access/
│   │   └── CONTEXT.md
│   └── ...
├── docs/specs/
│   ├── product-spec.md
│   └── agent-workstreams.md
└── docs/adr/
```

Package context files are routing maps, not separate glossaries. Do not redefine terms there;
each term is defined in exactly one slice under `docs/context/glossary/`, and that slice is where
domain language changes.

## Use the glossary's vocabulary

When your output names a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term as defined in its glossary slice under `docs/context/glossary/` (find it via the `CONTEXT.md` index). Don't drift to synonyms the slice's `_Avoid_` line explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use, or there's a real gap to note for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (example decision), but worth reopening because..._
