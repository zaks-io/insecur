---
title: CLI overview
description: Every insecur command, the global flags, and the conventions shared by all of them.
section: CLI reference
order: 0
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# CLI overview

insecur CLI — metadata-only output, sealed local session auth

Install with `curl -fsSL https://insecur.cloud/install.sh | sh` (see [Installation](/docs/installation)).
Every command supports `--json` for metadata-only machine-readable output and exits with a
[stable exit code](/docs/reference/exit-codes). Failures carry stable
[error codes](/docs/reference/errors) with remediation commands in `--json` output. Secret
values are never accepted as command-line arguments and never appear in any output.

## Commands

| Command                                          | Description                                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [`insecur agent`](/docs/cli/agent)               | Agent harness attribution and child sessions                                                                   |
| [`insecur approvals`](/docs/cli/approvals)       | Metadata-only approval request status                                                                          |
| [`insecur audit`](/docs/cli/audit)               | Audit event feed and export verification                                                                       |
| [`insecur config`](/docs/cli/config)             | Local CLI configuration                                                                                        |
| [`insecur connections`](/docs/cli/connections)   | Manage org-scoped App Connections (metadata only)                                                              |
| [`insecur describe`](/docs/cli/describe)         | Describe the CLI command contract as metadata                                                                  |
| [`insecur envs`](/docs/cli/envs)                 | Environment navigation and creation                                                                            |
| [`insecur guide`](/docs/cli/guide)               | Offline CLI guides (markdown playbooks, no auth required)                                                      |
| [`insecur import`](/docs/cli/import)             | Import secrets from a local dotenv file into a development environment (create-only; all-or-nothing preflight) |
| [`insecur init`](/docs/cli/init)                 | Provision guided organization defaults and write .insecur.json                                                 |
| [`insecur local-files`](/docs/cli/local-files)   | Local plaintext secret file utilities (metadata-only; no secure erasure)                                       |
| [`insecur login`](/docs/cli/login)               | Authenticate with WorkOS AuthKit PKCE and mint a short-lived CLI credential                                    |
| [`insecur logout`](/docs/cli/logout)             | End the CLI session locally and revoke the server session                                                      |
| [`insecur operations`](/docs/cli/operations)     | Poll, wait on, and cancel long-running operations                                                              |
| [`insecur orgs`](/docs/cli/orgs)                 | Organization navigation                                                                                        |
| [`insecur projects`](/docs/cli/projects)         | Project navigation and creation                                                                                |
| [`insecur run`](/docs/cli/run)                   | Run a command with runtime injection from a CLI profile policy or one exact variable key                       |
| [`insecur run-policies`](/docs/cli/run-policies) | Manage Runtime Injection Policies (metadata only)                                                              |
| [`insecur scan`](/docs/cli/scan)                 | Offline project-scoped secret exposure report (metadata only)                                                  |
| [`insecur secrets`](/docs/cli/secrets)           | Blind secret writes and metadata-only management                                                               |
| [`insecur shell`](/docs/cli/shell)               | Start a subshell with INSECUR_SESSION_TOKEN in the environment                                                 |
| [`insecur whoami`](/docs/cli/whoami)             | Report acting human, session validity, resolved context, and attribution tier                                  |

## Global flags

These apply to every command.

| Option                | Description                                                       |
| --------------------- | ----------------------------------------------------------------- |
| `--host <url>`        | insecur API host                                                  |
| `--org-id <id>`       | organization opaque id                                            |
| `--project-id <id>`   | project opaque id                                                 |
| `--env-id <id>`       | environment opaque id                                             |
| `--profile <slug>`    | CLI profile slug                                                  |
| `--profile-id <id>`   | CLI profile opaque id                                             |
| `--config-dir <path>` | directory containing .insecur.json                                |
| `--agent <name>`      | agent attribution tag (Tier 3)                                    |
| `--json`              | metadata-only JSON output                                         |
| `--quiet`             | suppress non-essential human output                               |
| `--verbose`           | verbose logging                                                   |
| `--color`             | force colored human output                                        |
| `--no-color`          | disable colored human output                                      |
| `--full`              | show full opaque ids in tables instead of truncating              |
| `--no-crash-reports`  | disable default-on sanitized CLI crash reporting for this command |
| `-V, --version`       | output the version number                                         |

## Related

- [Quickstart](/docs/quickstart)
- [Environment variables](/docs/reference/environment-variables)
