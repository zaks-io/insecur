#!/usr/bin/env bash
# Install the OSS gitleaks CLI (no GITLEAKS_LICENSE required).
set -euo pipefail

version="8.30.1"
checksum="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
archive="gitleaks_${version}_linux_x64.tar.gz"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

curl -sSfL -o "${tmpdir}/${archive}" \
  "https://github.com/gitleaks/gitleaks/releases/download/v${version}/${archive}"
(
  cd "${tmpdir}"
  printf '%s  %s\n' "${checksum}" "${archive}" | sha256sum --check --strict -
)
tar -xzf "${tmpdir}/${archive}" -C "${tmpdir}" gitleaks

install -m 0755 "${tmpdir}/gitleaks" /usr/local/bin/gitleaks
gitleaks version
