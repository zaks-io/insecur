#!/usr/bin/env bash
# Run gitleaks with the repo config (documentation false-positive allowlists).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
config="${repo_root}/.gitleaks.toml"
mode="${1:-detect}"

if [ ! -f "${config}" ]; then
  echo "missing gitleaks config: ${config}" >&2
  exit 1
fi

cd "${repo_root}"

case "${mode}" in
  detect)
    report_args=()
    if [ -n "${GITLEAKS_REPORT_PATH:-}" ]; then
      mkdir -p "$(dirname "${GITLEAKS_REPORT_PATH}")"
      report_args=(--report-format json --report-path "${GITLEAKS_REPORT_PATH}")
    fi
    gitleaks detect --config "${config}" --source . --no-git --redact --no-banner --verbose "${report_args[@]}"
    bash "${repo_root}/scripts/ci/gitleaks-workflow-config-probe.sh"
    bash "${repo_root}/scripts/ci/gitleaks-setup-doc-probe.sh"
    ;;
  git)
    report_args=()
    if [ -n "${GITLEAKS_REPORT_PATH:-}" ]; then
      mkdir -p "$(dirname "${GITLEAKS_REPORT_PATH}")"
      report_args=(--report-format json --report-path "${GITLEAKS_REPORT_PATH}")
    fi
    gitleaks git --config "${config}" --redact --no-banner --verbose "${report_args[@]}"
    ;;
  *)
    echo "usage: $0 [detect|git]" >&2
    exit 2
    ;;
esac
