import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SMOKE_ARTIFACT_CREDENTIAL_REGISTRY_ENV = "SMOKE_ARTIFACT_CREDENTIAL_REGISTRY";

export function registerSmokeArtifactCredential(credential: string): void {
  const path = registryPath();
  if (path === undefined) {
    return;
  }

  const credentials = readCredentials(path);
  if (!credentials.includes(credential)) {
    writeFileSync(path, JSON.stringify([...credentials, credential]), { mode: 0o600 });
  }
}

export function readSmokeArtifactCredentials(): string[] {
  const path = registryPath();
  return path === undefined ? [] : readCredentials(path);
}

export function clearSmokeArtifactCredentials(): void {
  const path = registryPath();
  if (path !== undefined) {
    rmSync(path, { force: true });
  }
}

function registryPath(): string | undefined {
  const path = process.env[SMOKE_ARTIFACT_CREDENTIAL_REGISTRY_ENV];
  return path === undefined || path.trim() === "" ? undefined : path;
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
