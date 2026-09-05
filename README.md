# insecur

**Run your app without plaintext `.env` files.**

[![CI](https://github.com/zaks-io/insecur/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/zaks-io/insecur/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Finsecur.cloud%2Fbadges%2Fcoverage.json)](https://github.com/zaks-io/insecur/actions/workflows/ci.yml)
[![CLI](https://img.shields.io/github/v/tag/zaks-io/insecur?filter=cli-v*&sort=semver&label=cli)](https://github.com/zaks-io/insecur/releases?q=cli-v&expanded=true)
[![security-daily](https://github.com/zaks-io/insecur/actions/workflows/security-daily.yml/badge.svg)](https://github.com/zaks-io/insecur/actions/workflows/security-daily.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

insecur is an experimental developer tool for storing development secrets encrypted and injecting
them when you run a command. It gives you one place to put credentials instead of hunting through
dashboards, notes, and old project files, and lets your app run without a plaintext `.env` file on
disk.

Every other secrets tool is named after a fortress. We named this one after the problem, because the job is to remove the specific ways secrets leak, not to sell a feeling of safety. Yes, the name is on purpose.

The boundary is specific: the child process receives the secret in its environment, so that process
or an agent controlling it can still read the value at runtime. insecur reduces secrets left at rest
and copied through routine workflows. It does not make a secret invisible to the code using it.

## Why

Development credentials tend to accumulate wherever they were easiest to put: `.env` files, shell
history, provider dashboards, notes, and chat transcripts. That makes them hard to find when you
need them and easy for a coding agent to encounter while debugging.

insecur currently focuses on a smaller job:

- store development secrets encrypted instead of keeping plaintext values beside the code;
- inject them into one child process for one command;
- keep secret values out of routine copy-and-paste work;
- record grants and use so exposure is easier to investigate.

The longer-term direction includes provider-backed rotation, so a developer can replace a credential
quickly after an agent or process exposes it. That recovery workflow is not available yet. Production
custody is also unproven and must not be used for valuable production secrets. The intended model is
documented in the [security model](https://insecur.cloud/docs/security-model) and the
[threat model](docs/whitepaper/threat-model.md).

## What you can do with it

- **Find leaks:** `insecur scan` produces an offline, metadata-only secret exposure report for your project, and can optionally scan agent transcripts and well-known credential locations.
- **Remove a plaintext `.env`:** `insecur import .env` copies a dotenv file into an encrypted
  development environment, all-or-nothing. The source stays in place until you explicitly run
  `insecur local-files rm .env`; then `insecur scan` checks its configured paths for readable
  copies.
- **Generate secrets without copying them:** `insecur secrets set KEY --generate` creates and stores
  a value without printing it. There is no `get` or `export` command.
- **Run without files:** `insecur run` injects secrets into the child process environment for
  one command. Code in that process can read or persist them.
- **Keep everything on the record:** every grant and use is audited and exportable; machine access uses short-lived scoped credentials, never tokens that live forever.

## Quickstart

Install the [GitHub CLI](https://cli.github.com/) first. The installer requires `gh attestation`
support and refuses binaries without valid build provenance. It verifies the downloaded binary's
checksum and GitHub build attestation; like any `curl | sh` bootstrap, this command still trusts
the HTTPS installer endpoint and the script it returns.

```sh
curl -fsSL https://insecur.cloud/install.sh | sh
insecur login
insecur init
insecur secrets set SESSION_SIGNING_KEY --generate
insecur run --variable-key SESSION_SIGNING_KEY -- npm start
```

The generated value is not printed, written to a plaintext file, or placed in shell history. It is
available to the command launched by `insecur run`, and anything controlling that process can read
it. The five-minute walkthrough lives at
[insecur.cloud/docs/quickstart](https://insecur.cloud/docs/quickstart), the agent-oriented version at
[insecur.cloud/docs/agent-quickstart](https://insecur.cloud/docs/agent-quickstart), and a copyable
end-to-end verifier in [examples/first-value-proof](examples/first-value-proof).

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
  secret-store/       secret versions and blind secret write rules
  secret-sync/        alpha GitHub Actions and Cloudflare Worker delivery
  runtime-injection/  runtime injection grants
  onboarding/         guided organization provisioning
  cli/                the `insecur` CLI
```

## Status

insecur is open source (Apache-2.0); the hosted service at insecur.cloud is operated by Zaks.io, LLC. The project is in pre-launch build-out and is not approved for valuable production secrets yet. Local Mode, the hosted First Value loop, the metadata web console, and protected-change approval flows are implemented. Provider sync has early GitHub Actions and Cloudflare Worker adapters, but it is alpha and does not yet have enough provider-level testing to be treated as reliable. Production delivery remains blocked until the [Storage Security Gate](docs/storage-security-gate.md) has complete runtime evidence and enforcement. Current code, deployment evidence, and remaining launch work are tracked in [docs/project-status.md](docs/project-status.md).

## Development

Requires Node 24 and pnpm 10. See [docs/setup.md](docs/setup.md) for the full setup.

```sh
pnpm install --frozen-lockfile
pnpm dev:check          # verify the local toolchain and required files
pnpm dev:db:reset       # local Postgres 17 via Docker Compose
pnpm dev:workers        # run the API + Runtime Workers locally
pnpm verify             # the full CI gate: policy checks, lint, typecheck, tests
```

Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: see [SECURITY.md](SECURITY.md).

## License and the hosted service

The insecur source code is open source under [Apache-2.0](LICENSE), copyright Zaks.io, LLC (see [NOTICE](NOTICE)). You are free to use, modify, and redistribute it under that license.

The hosted service at [insecur.cloud](https://insecur.cloud) is a commercial offering operated by Zaks.io, LLC, governed by its own [terms](https://insecur.cloud/terms) and [privacy policy](https://insecur.cloud/privacy) rather than the code license. The insecur name and logo are trademarks of Zaks.io, LLC; Apache-2.0 does not grant trademark rights.
