#!/usr/bin/env bash
# Regression: token-shaped secrets on UUID-bearing lines in workflow config must not be allowlisted.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config="${repo_root}/.gitleaks.toml"
source_config="${repo_root}/docs/agents/workflow/config.md"
# The generic-api-key allowlist for this file is `condition = "and"` over a path and a
# bare-UUID regex. The fixture has to trip generic-api-key specifically: a token shape
# owned by some other rule would pass this probe no matter how far that allowlist widens.
probe_line="$(printf '%s%s%s' \
  '- [gitleaks-probe `11111111-2222-4333-8444-555555555555` ' \
  'generic_secret = ' \
  '"aBcD3fGh1jKlMn0pQrSt2vWxYz456789"]')"

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

mkdir -p "${tmpdir}/docs/agents/workflow"
cp "${source_config}" "${tmpdir}/docs/agents/workflow/config.md"
printf '%s\n' "${probe_line}" >> "${tmpdir}/docs/agents/workflow/config.md"

# gitleaks matches allowlist `paths` regexes against the path as scanned. The allowlist this
# probe guards is anchored `^docs/agents/workflow/config\.md$`, so it only ever matches a
# repo-relative path. Scan from inside the fixture tree so that anchor can match: under an
# absolute --source it goes inert, and the probe then passes because nothing was allowlisted
# rather than because the allowlist is narrow, which is blind to exactly the widening it
# exists to catch. Allowlists written `(^|/)...`, such as the `.turbo/` one, still match
# mid-path and are unaffected either way.
probe_line_number="$(awk 'END { print NR }' "${tmpdir}/docs/agents/workflow/config.md")"
source "${repo_root}/scripts/ci/gitleaks-probe-lib.sh"
assert_gitleaks_probe "${tmpdir}" "${config}" "generic-api-key" "docs/agents/workflow/config.md" "${probe_line_number}"

echo "gitleaks workflow-config allowlist probe passed (token+UUID line correctly flagged)."
