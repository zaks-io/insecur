#!/usr/bin/env bash
# Install the OSS gitleaks CLI (no GITLEAKS_LICENSE required).
set -euo pipefail

version="${GITLEAKS_VERSION:-8.24.2}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

curl -sSfL \
  "https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz" \
  | tar -xz -C "${tmpdir}" gitleaks

install -m 0755 "${tmpdir}/gitleaks" /usr/local/bin/gitleaks
gitleaks version
