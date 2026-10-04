#!/usr/bin/env bash
# Regression: the probe script's historical bearer fixture must be allowlisted exactly.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config="${repo_root}/.gitleaks.toml"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

# Materialise the repo-relative path so its anchored allowlist actually participates.
# Keep synthetic tokens split in this source, just like the setup-doc probe.
mkdir -p "${tmpdir}/scripts/ci"
fixture="${tmpdir}/scripts/ci/gitleaks-setup-doc-probe.sh"
printf '%s%s%s\n' 'curl -H "authorization: Bearer ins_live_' \
  'supersecrettoken1234567890' '"' > "${fixture}"
printf '%s%s%s\n' 'curl -H "authorization: Bearer ins_live_' \
  'supersecrettoken1234567890' '1234567890"' >> "${fixture}"

source "${repo_root}/scripts/ci/gitleaks-probe-lib.sh"
assert_gitleaks_probe "${tmpdir}" "${config}" "curl-auth-header" "scripts/ci/gitleaks-setup-doc-probe.sh" 2

echo "gitleaks probe-script allowlist probe passed (only the exact fixture token is allowlisted)."
