# ADR-0082: CLI Error Remediation Follows RFC 9457 Problem Details

Date: 2026-07-09

Status: Accepted

CLI error output is a dual-consumer surface: a human reads a terminal, and an agent parses `--json`.
Agents run `--json`, so an error that carries a recovery only in human prose forces the agent to
NLP-parse the message — a wasted round-trip and wasted tokens on every retry. The CLI error envelope
therefore carries machine-readable, actionable remediation modeled on
[RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457), rendered two ways from one
internal error object: pretty for humans, structured for agents, selected by `--json`/TTY.

This settles how errors are shaped so it is not re-litigated: a new actionable error extends the
existing `remediation` object, it does not invent a new prose convention.

The shape, additive over the existing `{ code, message, retryable }` body and exit-code taxonomy
(both lockstep-tested and preserved):

- **`remediation.type`** — a stable per-code error-type URI
  (`https://insecur.dev/errors/<code-with-dashes>`) derived deterministically from the error code.
  A durable dispatch key for agents that does not drift with message wording or i18n.
- **`remediation.suggestedFix`** — a one-line plain-language recovery.
- **`remediation.usage`** — the exact corrected argv the caller should run next
  (e.g. `["insecur","secrets","set","<VARIABLE_KEY>","--value-stdin"]`).
- Existing typed command fields (`login`, `init`, `poll`, `resume`, …) and `approvalUrl` remain.

The two failures agents hit most now carry structured remediation, closing the prior `--json` blind
spot: `cli.validation_error` (bad or missing arguments — remediation carries the corrected `usage`
captured from the parser plus a `suggestedFix`) and `secret.input_required` (remediation carries
the `secrets set <VARIABLE_KEY> --value-stdin` usage; `--generate random` is only suggested as the
option for minting a brand-new random secret, never as the default for an existing value). Both are
marked remediation-`required`
in the error-code registry.

Exit codes are unchanged: the mature per-code exit-code taxonomy (`docs/cli-and-sync.md` Error Code
To Exit Code Mapping) remains the machine branch key alongside the envelope.

## Consequences

New remediation fields are metadata-only strings and argv arrays; they pass the
`assertMetadataOnlyValue` envelope guard (no forbidden keys) and never carry a Sensitive Value —
`usage` carries only placeholders and opaque IDs. The error-code / exit-code / HTTP-status /
remediation-marker tables in `docs/cli-and-sync.md` stay the only code-enforced coupling
(`error-code-registry.test.ts`, `remediation-registry.test.ts`, `exit-codes.test.ts`); a code that
carries CLI remediation must be marked `required` there, and dynamically-supplemented codes are
listed in `CLI_REMEDIATION_SUPPLEMENT_CODES`.

We adopt the RFC 9457 _field vocabulary_ (`type`, `suggested_fix`), not its full envelope: insecur
keeps its own stable `{ ok, error, meta, remediation }` shape, which the API and CLI already share,
rather than reshaping to the RFC's top-level `{ type, title, status, detail, instance }`. Migrating
the whole envelope would churn every lockstep table and the API for no agent-visible gain over the
additive fields.

Trace: [ADR-0007](0007-developer-first-cli-contract.md),
[ADR-0062](0062-package-seam-failures-are-errorbody-compatible.md),
[ADR-0068](0068-stable-dotted-code-vocabularies-in-canonical-catalogs.md),
[ADR-0081](0081-cli-positional-argument-grammar.md),
[cli-and-sync.md](../cli-and-sync.md).
