#!/usr/bin/env bash
# Install the actionlint GitHub Actions workflow linter.
set -euo pipefail

version="1.7.12"
checksum="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
archive="actionlint_${version}_linux_amd64.tar.gz"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

curl -sSfL -o "${tmpdir}/${archive}" \
  "https://github.com/rhysd/actionlint/releases/download/v${version}/${archive}"
(
  cd "${tmpdir}"
  printf '%s  %s\n' "${checksum}" "${archive}" | sha256sum --check --strict -
)
tar -xzf "${tmpdir}/${archive}" -C "${tmpdir}" actionlint

install -m 0755 "${tmpdir}/actionlint" /usr/local/bin/actionlint
actionlint --version
