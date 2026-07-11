import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SMOKE_ARTIFACT_CREDENTIAL_REGISTRY_ENV = "SMOKE_ARTIFACT_CREDENTIAL_REGISTRY";
const DEFAULT_REGISTRY_FILENAME = "insecur-preview-smoke-artifact-credentials.json";

export function registerSmokeArtifactCredential(credential: string): void {
  const path = registryPath();
  const credentials = readCredentials(path);
  if (!credentials.includes(credential)) {
    writeFileSync(path, JSON.stringify([...credentials, credential]), { mode: 0o600 });
  }
}

export function readSmokeArtifactCredentials(): string[] {
  return readCredentials(registryPath());
}

export function clearSmokeArtifactCredentials(): void {
  rmSync(registryPath(), { force: true });
}

/**
 * The registry must never silently disable itself: a minted bearer that goes unregistered is
 * exactly the credential the artifact sweep exists to revoke and scan for (INS-586). When the env
 * override is absent, the mint and sweep processes fall back to the same deterministic per-machine
 * path instead of no-opping.
 */
function registryPath(): string {
  const path = process.env[SMOKE_ARTIFACT_CREDENTIAL_REGISTRY_ENV];
  return path === undefined || path.trim() === ""
    ? join(tmpdir(), DEFAULT_REGISTRY_FILENAME)
    : path;
}

function readCredentials(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }

  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!Array.isArray(value)) {
      throw new Error("invalid");
    }
    const credentials: string[] = [];
    for (const credential of value) {
      if (typeof credential !== "string" || credential === "") {
        throw new Error("invalid");
      }
      credentials.push(credential);
    }
    return [...new Set(credentials)];
  } catch {
    throw new Error("Preview smoke artifact credential registry is invalid");
  }
}
