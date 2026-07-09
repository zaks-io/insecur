# insecur

**Secrets your agents never have to hold.**

[![CI](https://github.com/zaks-io/insecur/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/zaks-io/insecur/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Finsecur.cloud%2Fbadges%2Fcoverage.json)](https://github.com/zaks-io/insecur/actions/workflows/ci.yml)
[![CLI](https://img.shields.io/github/v/tag/zaks-io/insecur?filter=cli-v*&sort=semver&label=cli)](https://github.com/zaks-io/insecur/releases?q=cli-v&expanded=true)
[![security-daily](https://github.com/zaks-io/insecur/actions/workflows/security-daily.yml/badge.svg)](https://github.com/zaks-io/insecur/actions/workflows/security-daily.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

insecur is secrets custody built for coding agents. Your agent asks for the secret it needs, insecur creates and sets the value, and the agent gets back a working key. It never types, picks, or copies the raw secret, and there is no plaintext `.env` file left on disk for it to read.

Every other secrets tool is named after a fortress. We named this one after the problem, because the job is to remove the specific ways secrets leak, not to sell a feeling of safety. Yes, the name is on purpose.

## Why

Secrets management was built for humans and servers. Then coding agents started reading repos at 100 tokens a second, and teams started running several in parallel. The leak is not a break-in. It is a helpful status line you scrolled past: "I'll just read your `.env` to debug this." You cannot out-watch a swarm of fast agents, so oversight was never the control. The only thing that holds at this speed is structural: take the readable secret off the table.

insecur does that in two tiers, and is honest about the difference:

- **Development secrets** are injected into the child process at runtime and never touch disk. A local agent could still read the value it uses; we don't claim otherwise. The protection is a small, recoverable blast radius: no plaintext file at rest, one short-lived single-use audited grant per run, and trivial rotation.
- **Protected (production) secrets** never reach the machine your agent runs on. Delivery requires a machine credential bound to that environment, living in CI/CD, and promotion goes through an approval no single agent-reachable channel can clear. The boundary is enforced by infrastructure, not by hoping the local process behaves.

The full custody model is in the [security model](https://insecur.cloud/docs/security-model) and the [threat model](docs/whitepaper/threat-model.md).

## What you can do with it

- **Find leaks:** `insecur scan` produces an offline, metadata-only secret exposure report for your project, and can optionally scan agent transcripts and well-known credential locations.
- **Kill your `.env`:** `insecur import .env` moves a dotenv file into an encrypted development environment, all-or-nothing, then `insecur scan` confirms nothing readable is left behind.
- **Blind-write secrets:** `insecur secrets set KEY --generate` creates a value no human chose, saw, or pasted anywhere. There is no `get` or `export` command, on purpose.
- **Run without files:** `insecur run` injects secrets into the process environment for exactly one run. They leave when the process does.
- **Keep everything on the record:** every grant and use is audited and exportable; machine access uses short-lived scoped credentials, never tokens that live forever.

Robots are free. Machine identities, runtime injection, and CI access are never metered; we charge for people.

## Quickstart

```sh
curl -fsSL https://insecur.cloud/install.sh | sh   # verifies the release checksum before installing
insecur login
insecur init
insecur secrets set SESSION_SIGNING_KEY --generate
insecur run --variable-key SESSION_SIGNING_KEY -- npm start
```

The value never appeared on your screen, in a file, in your shell history, or in an agent transcript. The five-minute walkthrough lives at [insecur.cloud/docs/quickstart](https://insecur.cloud/docs/quickstart), the agent-oriented version at [insecur.cloud/docs/agent-quickstart](https://insecur.cloud/docs/agent-quickstart), and a copyable end-to-end verifier in [examples/first-value-proof](examples/first-value-proof).

## Documentation

- [Product docs](https://insecur.cloud/docs) — quickstart, concepts, guides, and CLI reference (also served as raw markdown and [llms.txt](https://insecur.cloud/llms.txt) for agents)
- [docs/vision.md](docs/vision.md) — the north star and operating principles
- [docs/specs/README.md](docs/specs/README.md) — canonical product spec and source-of-truth rules
- [docs/architecture.md](docs/architecture.md) and [docs/adr/README.md](docs/adr/README.md) — architecture and decision records
- [CONTEXT-MAP.md](CONTEXT-MAP.md) and [CONTEXT.md](CONTEXT.md) — domain language and context routing for contributors and agents

## Architecture

insecur runs as capability-isolated Cloudflare Workers, never a monolith: a public API Worker that holds no key material, a private Runtime Worker that is the sole holder of the root key and the only place decryption happens (reachable only over a private Service Binding, zero public routes), and a Web BFF. Storage is Neon Postgres behind Hyperdrive with Row-Level Security, envelope encryption via WebCrypto, and tenant-bound data keys so a leak in one org cannot decrypt another.

```
apps/
  api/      public Cloudflare Worker API (no keyring, no DB bindings)
  runtime/  private Runtime Worker: DB, keyring, encrypt, decrypt
  web/      Web BFF on Workers
  site/     public marketing/documentation site
packages/
  domain/             shared domain primitives and vocabulary
  access/             effective access resolution
  tenant-store/       tenant-scoped store and RLS adapter contract
  crypto/             keyring and encryption envelope
  audit/              audit event writer
  secrets/            secret versions and blind secret write rules
  runtime-injection/  runtime injection grants
  onboarding/         guided organization provisioning
  cli/                the `insecur` CLI
```

## Status

insecur is open source (Apache-2.0); the hosted service at insecur.cloud is operated by Zaks.io, LLC. The project is in pre-launch build-out and not yet live. The First Value loop (diskless development secret use through the real API, Runtime Worker, and CLI) works end to end today; provider sync to GitHub and Cloudflare, protected delivery policy, and the production storage security gate are in progress. Production secret delivery stays blocked until the [Storage Security Gate](docs/storage-security-gate.md) passes. Current state and build order are tracked in [docs/project-status.md](docs/project-status.md) and [docs/roadmap.md](docs/roadmap.md).

## Development

Requires Node 24 and pnpm 10. See [docs/setup.md](docs/setup.md) for the full setup.

```sh
pnpm install --frozen-lockfile
pnpm dev:check          # verify toolchain and scaffold
pnpm dev:db:reset       # local Postgres 17 via Docker Compose
pnpm dev:workers        # run the API + Runtime Workers locally
pnpm verify             # the full CI gate: policy checks, lint, typecheck, tests
```

Security issues: see [SECURITY.md](SECURITY.md).

## License and the hosted service

The insecur source code is open source under [Apache-2.0](LICENSE), copyright Zaks.io, LLC (see [NOTICE](NOTICE)). You are free to use, modify, and redistribute it under that license.

The hosted service at [insecur.cloud](https://insecur.cloud) is a commercial offering operated by Zaks.io, LLC, governed by its own [terms](https://insecur.cloud/terms) and [privacy policy](https://insecur.cloud/privacy) rather than the code license. The insecur name and logo are trademarks of Zaks.io, LLC; Apache-2.0 does not grant trademark rights.
