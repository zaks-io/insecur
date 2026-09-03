# Contributing

insecur is open source under [Apache-2.0](LICENSE) and developed in the open, but it is prelaunch
and not yet accepting unsolicited feature pull requests. Issue triage and roadmap sequencing happen
in a private Linear tracker, so an unannounced PR has a good chance of colliding with work already
in flight.

What is welcome right now:

- **Security reports.** Follow [SECURITY.md](SECURITY.md). Report privately to security@zaks.io or
  through GitHub private vulnerability reporting. Never open a public issue with exploit details or
  credentials.
- **Bug reports.** Open a GitHub issue with reproduction steps using test data only.
- **Documentation corrections.** Small PRs that fix something factually wrong are fine to send
  directly.
- **Questions about the design.** Open a discussion or an issue. The reasoning behind most decisions
  is already written down in [docs/adr](docs/adr/README.md); check there first.

For anything larger, open an issue describing the problem before writing code.

## Working in this repo

Requires Node 24 and pnpm 10. `engine-strict=true` means `pnpm install` hard-fails on any other
Node major, so check `node --version` first. Full setup is in [docs/setup.md](docs/setup.md).

```sh
pnpm install --frozen-lockfile
pnpm dev:check          # verify toolchain and scaffold
pnpm verify             # the full gate: policy checks, lint, typecheck, tests
```

`pnpm verify` is what CI runs. Run it before pushing. Lefthook installs a pre-push hook that runs
`pnpm verify:prepush`, the faster PR-shaped subset.

Never bypass a gate to make something pass: no `--no-verify`, no ad-hoc environment variables to
coax a command into running. If a hook fails on code you did not touch, check whether your branch
has drifted from `main`.

## Conventions

- **Commits** follow Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `test:`,
  `perf:`, `build:`), with an optional scope: `fix(cli): ...`.
- **Branches** are never force-pushed. A repository ruleset blocks force-push on all non-default
  branches. Update a stale branch by merging `origin/main` in, not by rebasing.
- **Docs** have a single owner. Content ownership and conflict resolution are defined in
  [docs/specs/README.md](docs/specs/README.md) (ADR-0067). If a non-owning doc disagrees with its
  owning doc, the non-owning doc is the defect.
- **Architecture invariants** in [AGENTS.md](AGENTS.md) are non-negotiable and machine-enforced.
  In particular: Worker deploys are capability-isolated, and no deploy holds both a public route and
  the root-key binding. `pnpm conformance:topology` will reject a change that breaks this.

## Where to start reading

- [AGENTS.md](AGENTS.md) — the canonical instruction file for both humans and agents.
- [docs/agents/repo-navigation.md](docs/agents/repo-navigation.md) — how to find the right doc fast.
- [CONTEXT-MAP.md](CONTEXT-MAP.md) then the local `CONTEXT.md` for the app or package you will touch.
- [docs/agents/testing.md](docs/agents/testing.md) — the three test layers and which one your change
  belongs in.

## Licensing

By contributing you agree that your contribution is licensed under Apache-2.0, matching the rest of
the repository. There is no separate CLA. The insecur name and logo are trademarks of Zaks.io, LLC;
Apache-2.0 does not grant trademark rights.
