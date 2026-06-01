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
    gitleaks detect --config "${config}" --source . --redact --no-banner --verbose
    bash "${repo_root}/scripts/ci/gitleaks-workflow-config-probe.sh"
    bash "${repo_root}/scripts/ci/gitleaks-setup-doc-probe.sh"
    ;;
  git)
    gitleaks git --config "${config}" --redact --no-banner --verbose
    ;;
  *)
    echo "usage: $0 [detect|git]" >&2
    exit 2
    ;;
esac
