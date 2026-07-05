import { access, mkdir, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

import { KEY_STORE_ERROR_CODES, KeyStoreError } from "../errors.js";
import { assertMachineRootKeyHex, generateMachineRootKeyHex } from "../machine-root-key.js";
import type { KeyStoreAdapter, KeyStoreDependencies } from "../types.js";

const WINDOWS_SYSTEM_ROOT = process.env.SystemRoot ?? "C:\\Windows";
const POWERSHELL_EXE = `${WINDOWS_SYSTEM_ROOT}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;

const DPAPI_PROTECT_SCRIPT = [
  "param([string]$Path)",
  "$key = [Console]::In.ReadToEnd().Trim()",
  "Add-Type -AssemblyName System.Security",
  "$bytes = [Text.Encoding]::UTF8.GetBytes($key)",
  "$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "$dir = Split-Path -Parent $Path",
  "if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }",
  "[IO.File]::WriteAllText($Path, [Convert]::ToBase64String($protected))",
].join("; ");

const DPAPI_UNPROTECT_SCRIPT = [
  "param([string]$Path)",
  "Add-Type -AssemblyName System.Security",
  "$blob = [IO.File]::ReadAllText($Path)",
  "$bytes = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($blob), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))",
].join("; ");

async function writeDpapiProtectedKey(
  deps: KeyStoreDependencies,
  keyHex: string,
  filePath: string,
): Promise<void> {
  await deps.execFile(
    POWERSHELL_EXE,
    ["-NoProfile", "-NonInteractive", "-Command", DPAPI_PROTECT_SCRIPT, "-Path", filePath],
    { input: keyHex, windowsHide: true },
  );
}

async function readDpapiProtectedKey(
  deps: KeyStoreDependencies,
  filePath: string,
): Promise<string> {
  const result = await deps.execFile(
    POWERSHELL_EXE,
    ["-NoProfile", "-NonInteractive", "-Command", DPAPI_UNPROTECT_SCRIPT, "-Path", filePath],
    { windowsHide: true },
  );
  return assertMachineRootKeyHex(result.stdout);
}

async function dpapiFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function assertDpapiBlobWritten(filePath: string): Promise<void> {
  const stored = await readFile(filePath, "utf8");
  if (stored.trim() === "") {
    throw new KeyStoreError(KEY_STORE_ERROR_CODES.adapterFailed, "Windows DPAPI key store failed");
  }
}

export function createWindowsDpapiAdapter(deps: KeyStoreDependencies): KeyStoreAdapter {
  return {
    backend: "windows-dpapi",
    notice: null,
    async getOrCreateMachineRootKey() {
      const filePath = deps.paths.machineRootKeyDpapiFilePath;

      if (await dpapiFileExists(filePath)) {
        try {
          return await readDpapiProtectedKey(deps, filePath);
        } catch (error) {
          throw new KeyStoreError(
            KEY_STORE_ERROR_CODES.adapterFailed,
            "Windows DPAPI key lookup failed",
            { cause: error },
          );
        }
      }

      await mkdir(deps.paths.userConfigDir, { recursive: true });
      const keyHex = generateMachineRootKeyHex(deps.randomBytes);

      try {
        await writeDpapiProtectedKey(deps, keyHex, filePath);
        await assertDpapiBlobWritten(filePath);
      } catch (error) {
        if (error instanceof KeyStoreError) {
          throw error;
        }
        throw new KeyStoreError(
          KEY_STORE_ERROR_CODES.adapterFailed,
          "Windows DPAPI key store failed",
          { cause: error },
        );
      }

      return keyHex;
    },
  };
}
