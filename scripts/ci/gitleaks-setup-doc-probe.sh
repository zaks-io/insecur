#!/usr/bin/env bash
# Regression: real bearer tokens in setup doc must not be allowlisted by placeholder rules.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config="${repo_root}/.gitleaks.toml"
source_setup="${repo_root}/docs/setup.md"
probe_line="$(printf '%s%s%s' \
  'curl -H "authorization: Bearer ' \
  'ins_live_' \
  'supersecrettoken1234567890"')"

tmpdir="$(mktemp -d)"
probe_out="$(mktemp)"
trap 'rm -rf "${tmpdir}" "${probe_out}"' EXIT

mkdir -p "${tmpdir}/docs"
cp "${source_setup}" "${tmpdir}/docs/setup.md"
printf '%s\n' "${probe_line}" >> "${tmpdir}/docs/setup.md"

# See gitleaks-workflow-config-probe.sh: scan relative so the `^`-anchored path allowlists
# in .gitleaks.toml actually apply. An absolute --source silently disables all of them.
if (cd "${tmpdir}" && gitleaks detect \
  --config "${config}" \
  --source . \
  --no-git \
  --redact \
  --no-banner) >"${probe_out}" 2>&1; then
  echo "::error::gitleaks setup-doc probe failed: bearer token line was not reported as a leak." >&2
  cat "${probe_out}" >&2
  exit 1
fi

echo "gitleaks setup-doc allowlist probe passed (bearer token line correctly flagged)."
