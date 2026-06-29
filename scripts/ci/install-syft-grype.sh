#!/usr/bin/env bash
# Install pinned syft and grype CLIs with release tarball checksum verification.
set -euo pipefail

syft_version="${SYFT_VERSION:-1.46.0}"
grype_version="${GRYPE_VERSION:-0.115.0}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

install_anchore_cli() {
  local name="$1"
  local version="$2"
  local archive="${name}_${version}_linux_amd64.tar.gz"
  local base_url="https://github.com/anchore/${name}/releases/download/v${version}"

  curl -sSfL -o "${tmpdir}/${archive}" "${base_url}/${archive}"
  curl -sSfL -o "${tmpdir}/${name}-checksums.txt" "${base_url}/${name}_${version}_checksums.txt"

  local expected actual
  expected="$(awk -v archive="${archive}" '$2 == archive { print $1 }' "${tmpdir}/${name}-checksums.txt")"
  if [ -z "${expected}" ]; then
    echo "checksum entry not found for ${archive}" >&2
    exit 1
  fi

  actual="$(sha256sum "${tmpdir}/${archive}" | awk '{ print $1 }')"
  if [ "${expected}" != "${actual}" ]; then
    echo "checksum mismatch for ${archive}" >&2
    exit 1
  fi

  tar -xzf "${tmpdir}/${archive}" -C "${tmpdir}" "${name}"
  install -m 0755 "${tmpdir}/${name}" "/usr/local/bin/${name}"
  "${name}" version
}

install_anchore_cli syft "${syft_version}"
install_anchore_cli grype "${grype_version}"
