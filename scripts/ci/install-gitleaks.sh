#!/usr/bin/env bash
# Install the OSS gitleaks CLI (no GITLEAKS_LICENSE required).
set -euo pipefail

version="8.24.2"
checksum="fa0500f6b7e41d28791ebc680f5dd9899cd42b58629218a5f041efa899151a8e"
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
