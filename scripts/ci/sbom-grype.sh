#!/usr/bin/env bash
# Generate a CycloneDX SBOM with syft and scan it with grype (same paths end-to-end).
set -euo pipefail

fail_on="${1:-high}"
sbom_path="${SBOM_PATH:-sbom.cyclonedx.json}"

bash "$(dirname "$0")/install-syft-grype.sh"

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
