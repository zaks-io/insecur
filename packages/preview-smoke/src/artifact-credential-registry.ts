import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SMOKE_ARTIFACT_CREDENTIAL_REGISTRY_ENV = "SMOKE_ARTIFACT_CREDENTIAL_REGISTRY";
const DEFAULT_REGISTRY_DIRNAME = "insecur-preview-smoke";
const DEFAULT_REGISTRY_FILENAME = "artifact-credentials.json";

export function registerSmokeArtifactCredential(credential: string): void {
  const path = registryPath();
  assertSafeRegistryFile(path);
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
 * override is absent, the mint and sweep processes (separate node invocations) fall back to the
 * same per-user path so they still agree without an env var — but under a private directory this
 * process owns, so the deterministic path cannot be redirected by a planted symlink.
 */
function registryPath(): string {
  const override = process.env[SMOKE_ARTIFACT_CREDENTIAL_REGISTRY_ENV];
  if (override !== undefined && override.trim() !== "") {
    return override;
  }
  return join(ensurePrivateRegistryDir(), DEFAULT_REGISTRY_FILENAME);
}

/** Create (or adopt) a `0700` directory this user owns; refuse a symlinked or foreign one. */
function ensurePrivateRegistryDir(): string {
  const dir = join(tmpdir(), DEFAULT_REGISTRY_DIRNAME);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`smoke artifact credential registry dir ${dir} is not a real directory`);
  }
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new Error(`smoke artifact credential registry dir ${dir} is not owned by this user`);
  }
  return dir;
}

/**
 * A minted bearer must never be written through a symlink or into a group/other-accessible file.
 * Guard the registry path before every read and write; a missing file is fine (first register).
 */
function assertSafeRegistryFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`smoke artifact credential registry ${path} is not a regular file`);
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(`smoke artifact credential registry ${path} is group- or world-accessible`);
  }
}

function readCredentials(path: string): string[] {
  if (!existsSync(path)) {
    return [];
  }
  assertSafeRegistryFile(path);

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
