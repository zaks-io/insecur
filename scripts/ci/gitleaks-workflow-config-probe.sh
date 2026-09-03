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
probe_out="$(mktemp)"
trap 'rm -rf "${tmpdir}" "${probe_out}"' EXIT

mkdir -p "${tmpdir}/docs/agents/workflow"
cp "${source_config}" "${tmpdir}/docs/agents/workflow/config.md"
printf '%s\n' "${probe_line}" >> "${tmpdir}/docs/agents/workflow/config.md"

# gitleaks matches allowlist `paths` regexes against the path as scanned, and every path
# allowlist in .gitleaks.toml is `^`-anchored to a repo-relative path. Scan from inside the
# fixture tree so those anchors can match. An absolute --source makes every one of them
# inert, which leaves the probe passing for the wrong reason and blind to any widening.
if (cd "${tmpdir}" && gitleaks detect \
  --config "${config}" \
  --source . \
  --no-git \
  --redact \
  --no-banner) >"${probe_out}" 2>&1; then
  echo "::error::gitleaks workflow-config probe failed: token+UUID line was not reported as a leak." >&2
  cat "${probe_out}" >&2
  exit 1
fi

echo "gitleaks workflow-config allowlist probe passed (token+UUID line correctly flagged)."
