// Windows PowerShell installer served at https://insecur.cloud/install.ps1.
// Run with: irm https://insecur.cloud/install.ps1 | iex
//
// Parallel to install-sh.ts for the Windows .exe asset: downloads the binary,
// verifies it against SHA256SUMS, installs to %LOCALAPPDATA%\\insecur\\bin,
// and adds that dir to the user PATH if missing. Resolves "latest" via the
// releases/latest/download/ redirect (no GitHub API). Honors
// $env:INSECUR_CLI_VERSION (a cli-v* release tag), $env:INSECUR_INSTALL_DIR,
// and the $env:INSECUR_INSTALL_BASE_URL fixture-server test override.

export const INSTALL_PS1 = `# insecur CLI installer. https://insecur.cloud/install.ps1
#requires -Version 5
# The whole body runs in a child scope: \`irm | iex\` executes in the caller's
# scope, and strict mode / ErrorActionPreference must not leak into the
# user's session.
& {
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Repo = 'zaks-io/insecur'
$Bin = 'insecur'
$Version = if ($env:INSECUR_CLI_VERSION) { $env:INSECUR_CLI_VERSION } else { 'latest' }
$InstallDir = if ($env:INSECUR_INSTALL_DIR) { $env:INSECUR_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'insecur\\bin' }

function Fail($msg) { Write-Error "insecur: $msg"; exit 1 }

# 32-bit PowerShell on 64-bit Windows reports x86; PROCESSOR_ARCHITEW6432 carries
# the native architecture under WOW64, and the x64 binary runs fine there.
$arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
if ($arch -ne 'AMD64') {
  Fail "no prebuilt Windows binary for $arch. See https://github.com/$Repo/releases"
}
# Only insecur-windows-x64.exe is published today.
$asset = "$Bin-windows-x64.exe"

if ($env:INSECUR_INSTALL_BASE_URL) {
  # Download-base override for testing against a fixture server; checksums come
  # from the same base, so it grants no trust the caller does not already have.
  $base = $env:INSECUR_INSTALL_BASE_URL.TrimEnd('/')
} elseif ($Version -eq 'latest') {
  $base = "https://github.com/$Repo/releases/latest/download"
} else {
  $base = "https://github.com/$Repo/releases/download/$Version"
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ([System.Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  $exePath = Join-Path $tmp $asset
  $sumsPath = Join-Path $tmp 'SHA256SUMS'

  Write-Host "Downloading $asset ($Version)..."
  Invoke-WebRequest -Uri "$base/$asset" -OutFile $exePath -UseBasicParsing
  Invoke-WebRequest -Uri "$base/SHA256SUMS" -OutFile $sumsPath -UseBasicParsing

  Write-Host "Verifying checksum..."
  $want = $null
  foreach ($raw in Get-Content $sumsPath) {
    # SHA256SUMS lines: "<hash>  <file>" or "<hash> *<file>".
    $line = $raw -replace '\\*', ' '
    $parts = $line -split '\\s+', 2
    if ($parts.Count -eq 2 -and $parts[1].Trim() -eq $asset) { $want = $parts[0].Trim(); break }
  }
  if (-not $want) { Fail "no checksum for $asset in SHA256SUMS" }

  $got = (Get-FileHash -Algorithm SHA256 -Path $exePath).Hash.ToLowerInvariant()
  if ($want.ToLowerInvariant() -ne $got) {
    Fail "checksum mismatch for $asset\`n  expected $want\`n  got      $got"
  }

  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  $dest = Join-Path $InstallDir "$Bin.exe"
  Move-Item -Force -Path $exePath -Destination $dest

  Write-Host "Installed $Bin to $dest"

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $userPath) { $userPath = '' }
  $onPath = ($userPath -split ';') -contains $InstallDir
  if (-not $onPath) {
    $newPath = if ($userPath.TrimEnd(';')) { "$($userPath.TrimEnd(';'));$InstallDir" } else { $InstallDir }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host ""
    Write-Host "Added $InstallDir to your user PATH. Restart your terminal to use '$Bin'."
  }

  Write-Host ""
  Write-Host "Verify with: $Bin --version"
}
finally {
  Remove-Item -Recurse -Force -Path $tmp -ErrorAction SilentlyContinue
}
}
`;
