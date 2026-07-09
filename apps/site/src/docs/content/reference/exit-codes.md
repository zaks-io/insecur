---
title: Exit codes
description: The stable exit codes every insecur CLI command uses.
section: Reference
order: 3
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# Exit codes

Every `insecur` command exits with one of these codes. They are stable: scripts and agents
can branch on them. The exit code is derived from the failure's stable error code; the
[error reference](/docs/reference/errors) lists the exact mapping per code.

| Exit code | Meaning                                                                                  |
| --------- | ---------------------------------------------------------------------------------------- |
| `0`       | success                                                                                  |
| `1`       | unexpected failure                                                                       |
| `2`       | invalid usage or validation error                                                        |
| `3`       | authentication required or expired                                                       |
| `4`       | authorization denied                                                                     |
| `5`       | not found or intentionally indistinguishable forbidden/not found                         |
| `6`       | conflict or idempotency mismatch                                                         |
| `7`       | action required: provider error, or `scan --strict` findings                             |
| `8`       | rate limited or retryable upstream failure                                               |
| `9`       | operation incomplete                                                                     |
| `10`      | human step-up required (a High-Assurance Challenge the acting credential cannot satisfy) |

Exit code `10` deserves special note for agents: it means a human step-up is required. The
`--json` error body includes the operation id; poll it with
`insecur operations wait <operation-id> --json` while a human clears the gate in the web
console. See [Approvals and step-up](/docs/approvals).

## Related

- [Error codes](/docs/reference/errors)
- [CLI overview](/docs/cli)
