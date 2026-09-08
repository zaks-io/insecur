#!/usr/bin/env bash
# Generate a CycloneDX SBOM with syft and scan it with grype (same paths end-to-end).
set -euo pipefail

fail_on="${1:-high}"
sbom_path="${SBOM_PATH:-sbom.cyclonedx.json}"

if ! command -v syft >/dev/null 2>&1 || ! command -v grype >/dev/null 2>&1; then
  bash "$(dirname "$0")/install-syft-grype.sh"
fi

for tool in syft grype; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "${tool} is unavailable after installation; refusing to skip the vulnerability scan." >&2
    exit 1
  fi
done

syft scan "dir:." -o "cyclonedx-json=${sbom_path}"

if [ -n "${GRYPE_JSON_PATH:-}" ]; then
  mkdir -p "$(dirname "${GRYPE_JSON_PATH}")"
  grype "sbom:${sbom_path}" -o json >"${GRYPE_JSON_PATH}"
fi

if [ "${fail_on}" = "none" ]; then
  grype "sbom:${sbom_path}"
else
  grype "sbom:${sbom_path}" --fail-on "${fail_on}"
fi
