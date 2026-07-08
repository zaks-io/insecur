#!/usr/bin/env bash
set -euo pipefail

ACTIONLINT_VERSION="${ACTIONLINT_VERSION:-1.7.12}"
GITLEAKS_VERSION="${GITLEAKS_VERSION:-8.24.2}"
SYFT_VERSION="${SYFT_VERSION:-1.46.0}"
GRYPE_VERSION="${GRYPE_VERSION:-0.115.0}"
TRIVY_VERSION="${TRIVY_VERSION:-0.72.0}"
SEMGREP_VERSION="${SEMGREP_VERSION:-1.168.0}"
CHECKOV_VERSION="${CHECKOV_VERSION:-3.3.7}"
NIKTO_VERSION="${NIKTO_VERSION:-2.6.0}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

debian_arch() {
  dpkg --print-architecture
}

release_arch() {
  local family="$1"
  case "$(debian_arch):${family}" in
    amd64:actionlint | amd64:anchore)
      printf 'amd64'
      ;;
    arm64:actionlint | arm64:anchore)
      printf 'arm64'
      ;;
    amd64:gitleaks)
      printf 'x64'
      ;;
    arm64:gitleaks)
      printf 'arm64'
      ;;
    amd64:trivy)
      printf '64bit'
      ;;
    arm64:trivy)
      printf 'ARM64'
      ;;
    *)
      echo "unsupported architecture $(debian_arch) for ${family}" >&2
      exit 1
      ;;
  esac
}

install_actionlint() {
  local arch
  arch="$(release_arch actionlint)"
  curl -sSfL \
    "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_${arch}.tar.gz" \
    | tar -xz -C "${tmpdir}" actionlint
  install -m 0755 "${tmpdir}/actionlint" /usr/local/bin/actionlint
}

install_gitleaks() {
  local arch archive base_url expected actual
  arch="$(release_arch gitleaks)"
  archive="gitleaks_${GITLEAKS_VERSION}_linux_${arch}.tar.gz"
  base_url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}"

  curl -sSfL -o "${tmpdir}/${archive}" "${base_url}/${archive}"
  curl -sSfL -o "${tmpdir}/gitleaks-checksums.txt" "${base_url}/gitleaks_${GITLEAKS_VERSION}_checksums.txt"

  expected="$(awk -v archive="${archive}" '$2 == archive { print $1 }' "${tmpdir}/gitleaks-checksums.txt")"
  actual="$(sha256sum "${tmpdir}/${archive}" | awk '{ print $1 }')"
  if [ -z "${expected}" ] || [ "${expected}" != "${actual}" ]; then
    echo "checksum mismatch for ${archive}" >&2
    exit 1
  fi

  tar -xzf "${tmpdir}/${archive}" -C "${tmpdir}" gitleaks
  install -m 0755 "${tmpdir}/gitleaks" /usr/local/bin/gitleaks
}

install_nikto() {
  curl -sSfL \
    "https://github.com/sullo/nikto/archive/refs/tags/${NIKTO_VERSION}.tar.gz" \
    | tar -xz -C "${tmpdir}"
  rm -rf /opt/nikto
  mv "${tmpdir}/nikto-${NIKTO_VERSION}" /opt/nikto
  cat > /usr/local/bin/nikto <<'EOF'
#!/usr/bin/env bash
cd /opt/nikto/program
exec perl ./nikto.pl "$@"
EOF
  chmod 0755 /usr/local/bin/nikto
}

install_anchore_cli() {
  local name="$1"
  local version="$2"
  local arch
  arch="$(release_arch anchore)"
  local archive="${name}_${version}_linux_${arch}.tar.gz"
  local base_url="https://github.com/anchore/${name}/releases/download/v${version}"

  curl -sSfL -o "${tmpdir}/${archive}" "${base_url}/${archive}"
  curl -sSfL -o "${tmpdir}/${name}-checksums.txt" "${base_url}/${name}_${version}_checksums.txt"

  local expected actual
  expected="$(awk -v archive="${archive}" '$2 == archive { print $1 }' "${tmpdir}/${name}-checksums.txt")"
  actual="$(sha256sum "${tmpdir}/${archive}" | awk '{ print $1 }')"
  if [ -z "${expected}" ] || [ "${expected}" != "${actual}" ]; then
    echo "checksum mismatch for ${archive}" >&2
    exit 1
  fi

  tar -xzf "${tmpdir}/${archive}" -C "${tmpdir}" "${name}"
  install -m 0755 "${tmpdir}/${name}" "/usr/local/bin/${name}"
}

install_trivy() {
  local version_without_v="${TRIVY_VERSION#v}"
  local arch
  arch="$(release_arch trivy)"
  local archive="trivy_${version_without_v}_Linux-${arch}.tar.gz"
  local base_url="https://github.com/aquasecurity/trivy/releases/download/v${version_without_v}"

  curl -sSfL -o "${tmpdir}/${archive}" "${base_url}/${archive}"
  curl -sSfL -o "${tmpdir}/trivy-checksums.txt" "${base_url}/trivy_${version_without_v}_checksums.txt"

  local expected actual
  expected="$(awk -v archive="${archive}" '$2 == archive { print $1 }' "${tmpdir}/trivy-checksums.txt")"
  actual="$(sha256sum "${tmpdir}/${archive}" | awk '{ print $1 }')"
  if [ -z "${expected}" ] || [ "${expected}" != "${actual}" ]; then
    echo "checksum mismatch for ${archive}" >&2
    exit 1
  fi

  tar -xzf "${tmpdir}/${archive}" -C "${tmpdir}" trivy
  install -m 0755 "${tmpdir}/trivy" /usr/local/bin/trivy
}

install_python_cli() {
  local package="$1"
  local version="$2"
  pipx install "${package}==${version}"
}

install_actionlint
install_gitleaks
install_nikto
install_anchore_cli syft "${SYFT_VERSION}"
install_anchore_cli grype "${GRYPE_VERSION}"
install_trivy
install_python_cli semgrep "${SEMGREP_VERSION}"
install_python_cli checkov "${CHECKOV_VERSION}"

actionlint --version
gitleaks version
syft version
grype version
trivy --version
semgrep --version
checkov --version
