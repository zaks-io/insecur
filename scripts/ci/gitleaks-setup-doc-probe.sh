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
trap 'rm -rf "${tmpdir}"' EXIT

mkdir -p "${tmpdir}/docs"
cp "${source_setup}" "${tmpdir}/docs/setup.md"
printf '%s\n' "${probe_line}" >> "${tmpdir}/docs/setup.md"

# See gitleaks-workflow-config-probe.sh: scan relative so the `^docs/setup\.md$`-anchored path
# allowlist actually matches. An absolute --source makes it inert and the probe goes blind.
probe_line_number="$(awk 'END { print NR }' "${tmpdir}/docs/setup.md")"
source "${repo_root}/scripts/ci/gitleaks-probe-lib.sh"
assert_gitleaks_probe "${tmpdir}" "${config}" "curl-auth-header" "docs/setup.md" "${probe_line_number}"

echo "gitleaks setup-doc allowlist probe passed (bearer token line correctly flagged)."
