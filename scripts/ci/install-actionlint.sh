#!/usr/bin/env bash
# Install the actionlint GitHub Actions workflow linter.
set -euo pipefail

version="${ACTIONLINT_VERSION:-1.7.12}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

curl -sSfL \
  "https://github.com/rhysd/actionlint/releases/download/v${version}/actionlint_${version}_linux_amd64.tar.gz" \
  | tar -xz -C "${tmpdir}" actionlint

install -m 0755 "${tmpdir}/actionlint" /usr/local/bin/actionlint
actionlint --version
