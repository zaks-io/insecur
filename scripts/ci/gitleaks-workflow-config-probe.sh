#!/usr/bin/env bash
# Regression: token-shaped secrets on UUID-bearing lines in workflow config must not be allowlisted.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config="${repo_root}/.gitleaks.toml"
source_config="${repo_root}/docs/agents/workflow/config.md"
# Base64 fixture (metadata-only regression line, not a committed credential).
probe_b64="LSBnaXRsZWFrcy1wcm9iZSBgNTYxNzQ0NWEtMzg5MS00YzQ0LTg4OWQtMjk2YWVlNmU0ODI4YCBjb25zdCBhcGlfa2V5ID0gInNrLXByb2JlLWFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MTIzNDU2Nzg5MCI7"
probe_line="$(printf '%s' "${probe_b64}" | base64 -d)"

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
