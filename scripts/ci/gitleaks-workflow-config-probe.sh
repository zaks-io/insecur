#!/usr/bin/env bash
# Regression: token-shaped secrets on UUID-bearing lines in workflow config must not be allowlisted.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config="${repo_root}/.gitleaks.toml"
source_config="${repo_root}/docs/agents/workflow/config.md"
probe_line="$(printf '%s%s%s' \
  '- [gitleaks-probe `11111111-2222-4333-8444-555555555555` const api_key = "' \
  'sk-probe-' \
  'abcdefghijklmnopqrstuvwxyz1234567890";')"

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

mkdir -p "${tmpdir}/docs/agents/workflow"
cp "${source_config}" "${tmpdir}/docs/agents/workflow/config.md"
printf '%s\n' "${probe_line}" >> "${tmpdir}/docs/agents/workflow/config.md"

if gitleaks detect \
  --config "${config}" \
  --source "${tmpdir}" \
  --no-git \
  --redact \
  --no-banner \
  >"${tmpdir}/gitleaks-probe.out" 2>&1; then
  echo "::error::gitleaks workflow-config probe failed: token+UUID line was not reported as a leak." >&2
  cat "${tmpdir}/gitleaks-probe.out" >&2
  exit 1
fi

echo "gitleaks workflow-config allowlist probe passed (token+UUID line correctly flagged)."
