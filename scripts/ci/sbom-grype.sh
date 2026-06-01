#!/usr/bin/env bash
# Generate a CycloneDX SBOM with syft and scan it with grype (same paths end-to-end).
set -euo pipefail

fail_on="${1:-high}"
sbom_path="${SBOM_PATH:-sbom.cyclonedx.json}"

curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin

syft scan "dir:." -o "cyclonedx-json=${sbom_path}"

if [ "${fail_on}" = "none" ]; then
  grype "sbom:${sbom_path}"
else
  grype "sbom:${sbom_path}" --fail-on "${fail_on}"
fi
