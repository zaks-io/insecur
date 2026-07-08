# hooks

Copy-paste hook recipes that gate a coding agent on a clean project disk. Each recipe runs `insecur scan --strict --quiet` (exit `0` when clean, `7` when likely secrets exist). Recipes are **opt-in**: add them to your agent settings yourself; insecur does not install or modify agent config.

## What this is (and is not)

These hooks are a **tripwire against well-meaning agents** that might read `.env` files or credential paths and echo them into a transcript. They are **not** a sandbox against hostile agents. The durable fix is secrets off disk — use `insecur guide migrate-env` after findings.

When the scan is **clean**, every recipe below produces **no agent-visible output** (silent-when-clean). When the scan is **hot**, recipes expose only **counts** (likely-secret count and file count), never key names or values. Run `insecur scan` without `--quiet` when you need the full metadata-only report.

`insecur scan --strict --quiet` writes one machine-terse summary line to **stderr** and nothing to stdout. Hook scripts read that line for counts; they must not forward finding details into agent context.

## Prerequisites

- `insecur` on `PATH` (global install or `pnpm exec insecur` adjusted in the commands below).
- Run hooks from your **project root** (where `.insecur.json` may live). `insecur scan` walks from the current working directory.

---

## Claude Code

Verified against [Claude Code hooks reference](https://code.claude.com/docs/en/hooks.md) (2026-07).

Settings locations: `~/.claude/settings.json` (all projects) or `.claude/settings.json` (project, committable). Use `/hooks` in Claude Code to inspect loaded hooks.

**Blocking semantics:** `PreToolUse` hooks that enforce policy must **`exit 2`**; stderr becomes the block reason shown to Claude. Exit `1` does **not** block.

### Advisory (session start)

Runs at `SessionStart`. When the tree is hot, injects one short context line (counts + `insecur guide migrate-env` pointer). When clean, prints nothing.

**1. Save the hook script** at `.claude/hooks/insecur-scan-advisory.sh` and make it executable (`chmod +x`):

```bash
#!/usr/bin/env bash
set -euo pipefail

stderr_file="$(mktemp)"
trap 'rm -f "$stderr_file"' EXIT

if insecur scan --strict --quiet 2>"$stderr_file"; then
  exit 0
fi

summary="$(tr -d '\n' <"$stderr_file")"
likely="$(printf '%s' "$summary" | sed -n 's/.*likely_secrets=\([0-9][0-9]*\).*/\1/p')"
files="$(printf '%s' "$summary" | sed -n 's/.*files=\([0-9][0-9]*\).*/\1/p')"
likely="${likely:-?}"
files="${files:-?}"

printf 'insecur scan: %s likely secret(s) across %s file(s) on disk. Run `insecur guide migrate-env` to move secrets off disk.\n' "$likely" "$files"
exit 0
```

**2. Add to settings** (merge into existing `"hooks"` if present):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/insecur-scan-advisory.sh",
            "timeout": 120,
            "statusMessage": "Checking project disk for likely secrets"
          }
        ]
      }
    ]
  }
}
```

`SessionStart` adds plain stdout to Claude's context on exit `0`. Clean scans produce no stdout, so the agent sees nothing.

### Strict (block file reads while hot)

Runs at `PreToolUse` before `Read`, `Grep`, and `Glob` — tools that read project files from disk. When hot, **`exit 2`** blocks the tool; stderr is the remediation pointer.

**1. Save the hook script** at `.claude/hooks/insecur-scan-strict.sh` and make it executable:

```bash
#!/usr/bin/env bash
set -euo pipefail

stderr_file="$(mktemp)"
trap 'rm -f "$stderr_file"' EXIT

if insecur scan --strict --quiet 2>"$stderr_file"; then
  exit 0
fi

summary="$(tr -d '\n' <"$stderr_file")"
likely="$(printf '%s' "$summary" | sed -n 's/.*likely_secrets=\([0-9][0-9]*\).*/\1/p')"
files="$(printf '%s' "$summary" | sed -n 's/.*files=\([0-9][0-9]*\).*/\1/p')"
likely="${likely:-?}"
files="${files:-?}"

printf 'Blocked: insecur scan found %s likely secret(s) in %s file(s) on disk. Run `insecur guide migrate-env` before reading project files.\n' "$likely" "$files" >&2
exit 2
```

**2. Add to settings:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read|Grep|Glob",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/insecur-scan-strict.sh",
            "timeout": 120,
            "statusMessage": "Scan-gate: checking disk before file read"
          }
        ]
      }
    ]
  }
}
```

---

## Codex

Verified against [Codex hooks documentation](https://developers.openai.com/codex/hooks) (2026-07).

Settings locations: `~/.codex/hooks.json`, `~/.codex/config.toml`, `.codex/hooks.json`, or `.codex/config.toml` (project-local hooks load only when the project `.codex/` layer is trusted). Use `/hooks` in the Codex CLI to review and trust hooks.

**Blocking semantics:** `PreToolUse` accepts **`exit 2`** with stderr, or JSON with `hookSpecificOutput.permissionDecision: "deny"`. Recipes below use exit `2` for parity with Claude Code.

`PreToolUse` reliably covers `Bash`, `apply_patch` (file edits), and MCP tools; it does not cover every Codex tool path. Treat strict mode as a guardrail, not complete containment.

### Advisory (session start)

Runs at `SessionStart`. Plain stdout becomes extra developer context. Silent when clean.

**1. Save the hook script** at `.codex/hooks/insecur-scan-advisory.sh` (resolve from git root in config below) and make it executable:

```bash
#!/usr/bin/env bash
set -euo pipefail

stderr_file="$(mktemp)"
trap 'rm -f "$stderr_file"' EXIT

if insecur scan --strict --quiet 2>"$stderr_file"; then
  exit 0
fi

summary="$(tr -d '\n' <"$stderr_file")"
likely="$(printf '%s' "$summary" | sed -n 's/.*likely_secrets=\([0-9][0-9]*\).*/\1/p')"
files="$(printf '%s' "$summary" | sed -n 's/.*files=\([0-9][0-9]*\).*/\1/p')"
likely="${likely:-?}"
files="${files:-?}"

printf 'insecur scan: %s likely secret(s) across %s file(s) on disk. Run `insecur guide migrate-env` to move secrets off disk.\n' "$likely" "$files"
exit 0
```

**2. Add to `hooks.json`** (merge into existing `"hooks"`):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/bin/env bash \"$(git rev-parse --show-toplevel)/.codex/hooks/insecur-scan-advisory.sh\"",
            "timeout": 120,
            "statusMessage": "Checking project disk for likely secrets"
          }
        ]
      }
    ]
  }
}
```

Trust the hook via `/hooks` before it runs. Prefer a git-root path so the hook works when Codex starts from a subdirectory.

### Strict (block disk-touching tools while hot)

Runs at `PreToolUse` before `Bash` and `apply_patch` (matcher aliases `Edit` and `Write`). When hot, **`exit 2`** blocks the tool.

**1. Save the hook script** at `.codex/hooks/insecur-scan-strict.sh` and make it executable:

```bash
#!/usr/bin/env bash
set -euo pipefail

stderr_file="$(mktemp)"
trap 'rm -f "$stderr_file"' EXIT

if insecur scan --strict --quiet 2>"$stderr_file"; then
  exit 0
fi

summary="$(tr -d '\n' <"$stderr_file")"
likely="$(printf '%s' "$summary" | sed -n 's/.*likely_secrets=\([0-9][0-9]*\).*/\1/p')"
files="$(printf '%s' "$summary" | sed -n 's/.*files=\([0-9][0-9]*\).*/\1/p')"
likely="${likely:-?}"
files="${files:-?}"

printf 'Blocked: insecur scan found %s likely secret(s) in %s file(s) on disk. Run `insecur guide migrate-env` before using tools that read project files.\n' "$likely" "$files" >&2
exit 2
```

**2. Add to `hooks.json`:**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/bin/env bash \"$(git rev-parse --show-toplevel)/.codex/hooks/insecur-scan-strict.sh\"",
            "timeout": 120,
            "statusMessage": "Scan-gate: checking disk before Bash"
          }
        ]
      },
      {
        "matcher": "apply_patch|Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/bin/env bash \"$(git rev-parse --show-toplevel)/.codex/hooks/insecur-scan-strict.sh\"",
            "timeout": 120,
            "statusMessage": "Scan-gate: checking disk before file edit"
          }
        ]
      }
    ]
  }
}
```

To gate MCP tools that read files, add another `PreToolUse` group with a matcher such as `mcp__.*` and the same strict script.

---

## Sanity-check the strict gate locally

You can verify the Claude Code strict script logic without starting Claude Code:

```bash
# From a clean temp dir — hook should exit 0 with no output
tmpdir="$(mktemp -d)"
(cd "$tmpdir" && bash /path/to/insecur-scan-strict.sh && echo "clean: ok")

# From a dir with a hot .env — hook should exit 2 and print migrate-env pointer to stderr
hotdir="$(mktemp -d)"
printf 'DEMO_KEY=placeholder\n' >"$hotdir/.env"
(cd "$hotdir" && bash /path/to/insecur-scan-strict.sh; echo "exit=$?")
```

Expect exit `0` and no stdout/stderr on the clean dir; exit `2` and a one-line stderr message with counts (not key names) on the hot dir.
