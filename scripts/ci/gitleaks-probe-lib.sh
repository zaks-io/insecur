#!/usr/bin/env bash
# Shared assertion for synthetic allowlist fixtures; callers own their temporary tree.
assert_gitleaks_probe() {
  local fixture_root="$1" config="$2" expected_rule="$3" expected_file="$4" expected_line="$5"
  local report="${fixture_root}/findings.json" scan_status=0

  # Relative source paths are required for the path-anchored allowlists under test.
  # Do not print scanner output or report contents: only metadata belongs in logs.
  (cd "${fixture_root}" && gitleaks detect \
    --config "${config}" --source . --no-git --redact --no-banner \
    --report-format json --report-path "${report}") >/dev/null 2>&1 || scan_status=$?

  if [ "${scan_status}" -ne 1 ]; then
    echo "::error::gitleaks probe failed for ${expected_file}: expected findings exit 1, got ${scan_status}." >&2
    return 1
  fi

  if ! jq -e --arg rule "${expected_rule}" --arg file "${expected_file}" --argjson line "${expected_line}" \
    'type == "array" and length == 1 and .[0].RuleID == $rule and .[0].File == $file and .[0].StartLine == $line' \
    "${report}" >/dev/null 2>&1; then
    echo "::error::gitleaks probe failed for ${expected_file}: expected one ${expected_rule} finding at the fixture path and line." >&2
    return 1
  fi
}
