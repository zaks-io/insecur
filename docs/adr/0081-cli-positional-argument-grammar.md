# ADR-0081: CLI Positional Arguments For The Primary Resource, Flags For Everything Else

Date: 2026-07-09

Status: Accepted

The CLI's argument grammar follows the [Command Line Interface Guidelines](https://clig.dev/)
default — _prefer flags to positional arguments_ — with one deliberate carve-out: **the single
primary subject of a command is a leading positional argument.** This is clig.dev's own exception:
"a common, primary action, where the brevity is worth memorizing" (`cp <source> <destination>`),
capped at one or two positionals, and only for the resource name or identifier the command acts on.

This settles a recurring question — "should this value be a positional or a flag?" — so it is not
re-litigated per command.

The rules:

- **The primary subject is one leading positional.** `secrets set <VARIABLE_KEY>`,
  `secrets promote <draft-version-id...>`, `secrets versions <secret-id>`,
  `secrets rollback <secret-id>`, `connections create <provider>`, `operations get <operation-id>`,
  `run [profile]`, `shell <profile>`, `import <file>`, `audit verify <jsonl>`,
  `config set <key> <value>`. The natural first thing a developer or agent types works on the first
  attempt; `insecur secrets set API_KEY` must not dead-end on a missing flag.
- **Client-minted opaque IDs stay flags.** A created resource's client-minted ID
  (`--project-id`, `--env-id`, `--connection-id`, `--policy-id`) is the creation idempotency key
  (ADR-0007, product-spec §7), not the human-facing subject. It stays a flag:
  `projects create --project-id prj_…`, `connections create <provider> --connection-id con_… --method oauth`.
  Making it positional would stack multiple different-kind positionals — the shape clig.dev calls
  "probably doing something wrong."
- **Second and subsequent different-kind inputs stay flags.** A required companion value that is
  not the subject (`--to-version-id`, `--method`, `--secret-id`, `--command`) is a flag even when
  required. Only repeated instances of the _same_ kind may be variadic positionals
  (`secrets promote <draft-version-id...>`).
- **Scope-selecting context stays flags with fallback.** `--env-id`/`--org-id`/`--project-id` at
  the global level select the acting scope; commands that target an existing environment resolve
  `--env-id` else the resolved profile/context, and never hard-require it as a bare commander
  `requiredOption` when the context path exists.

## Consequences

The grammar is disposable pre-V1 planning material with no back-compat contract
(`docs/cli-and-sync.md`), so redundant identity flags are removed rather than kept as hidden
aliases — one way to do each thing, no footgun. There is no command-inventory conformance gate; the
authoritative grammar lives in `docs/cli-and-sync.md`'s Command Shape section, and this ADR is the
rationale for the positional-vs-flag split when that doc is edited.

Normalizing scope resolution surfaced (and this work fixed) a latent defect: the CLI failure
renderer must select its output mode from `--json`/`--quiet` without re-running the resource-ID
parses that can throw, or a malformed `--env-id` escapes the top-level catch unrendered. Error
rendering reads only the output-shaping flags; resource-ID validation happens only on the success
path.

Trace: [ADR-0007](0007-developer-first-cli-contract.md),
[ADR-0082](0082-cli-error-shape-follows-rfc-9457.md),
[cli-and-sync.md](../cli-and-sync.md).
