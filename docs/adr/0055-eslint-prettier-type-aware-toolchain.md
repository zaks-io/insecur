# ADR-0055: ESLint And Prettier Type-Aware Toolchain

Date: 2026-05-25
Status: Accepted

insecur lints with ESLint (flat config, typescript-eslint `strictTypeChecked`, `parserOptions.projectService: true`) and formats with Prettier as the sole formatter for every file type, including Markdown. `eslint-config-prettier` is applied last so lint rules never fight the formatter. One ruleset runs everywhere, locally and in CI, with the `lint` task cached by Turbo for speed rather than split into a fast local tier and a strict CI tier. This deliberately diverges from the reference implementation at `~/src/agent-paste`, which standardized on Biome; the divergence is recorded here so a future reader does not try to unify the two repositories on Biome by reflex.

The driver is that insecur is a cryptography and authorization codebase, where full type-aware rules (`no-floating-promises`, the `no-unsafe-*` family, exhaustiveness on discriminated unions) catch real correctness defects that a syntactic linter cannot. Biome's type-aware coverage is not yet at parity for that work, and Biome cannot format Markdown, which would force Prettier back into the toolchain anyway and defeat the single-tool argument that makes Biome attractive. Choosing ESLint plus Prettier keeps one linter with deep type awareness and one formatter for all files.

## Considered Options

- **Biome, matching agent-paste.** Rejected here: its type-aware rule coverage is not at parity for a crypto/authz codebase, and it cannot format Markdown, so a second formatter would be required regardless.
- **A fast non-type-aware ESLint base locally, type-aware only in CI.** Rejected: it breaks the rule that a local pass predicts a CI pass, letting type-aware violations reach CI that a developer could not see locally. One ruleset everywhere, sped up by Turbo cache, is the chosen alternative.
- **Prettier only, no linter.** Rejected: formatting is not correctness, and the type-aware rules are the entire point of the toolchain.

## Consequences

- `projectService` relies on TypeScript project references across the workspace, so there are no per-package ESLint tsconfigs to maintain.
- Plain JavaScript files (`**/*.js`) take `tseslint.configs.disableTypeChecked`, since type-aware rules need a typed program.
- Linting is slower than Biome would be; this is mitigated by caching the `lint` task in Turbo rather than by weakening the rules.
