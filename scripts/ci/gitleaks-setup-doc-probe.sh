#!/usr/bin/env bash
# Regression: real bearer tokens in setup doc must not be allowlisted by placeholder rules.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config="${repo_root}/.gitleaks.toml"
source_setup="${repo_root}/docs/setup.md"
# Base64 fixture (metadata-only regression line, not a committed credential).
probe_b64="Y3VybCAtSCAiYXV0aG9yaXphdGlvbjogQmVhcmVyIGluc19saXZlX3N1cGVyc2VjcmV0dG9rZW4xMjM0NTY3ODkwIg=="
probe_line="$(printf '%s' "${probe_b64}" | base64 -d)"

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

mkdir -p "${tmpdir}/docs"
cp "${source_setup}" "${tmpdir}/docs/setup.md"
printf '%s\n' "${probe_line}" >> "${tmpdir}/docs/setup.md"

if gitleaks detect \
  --config "${config}" \
  --source "${tmpdir}" \
  --no-git \
  --redact \
  --no-banner \
  >"${tmpdir}/gitleaks-probe.out" 2>&1; then
  echo "::error::gitleaks setup-doc probe failed: bearer token line was not reported as a leak." >&2
  cat "${tmpdir}/gitleaks-probe.out" >&2
  exit 1
fi

echo "gitleaks setup-doc allowlist probe passed (bearer token line correctly flagged)."
