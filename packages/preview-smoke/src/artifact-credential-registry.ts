import {
  appendFileSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SMOKE_ARTIFACT_CREDENTIAL_REGISTRY_ENV = "SMOKE_ARTIFACT_CREDENTIAL_REGISTRY";
const DEFAULT_REGISTRY_DIRNAME = "insecur-preview-smoke";
const REGISTRY_FILE_PREFIX = "artifact-credentials-";
const REGISTRY_FILE_SUFFIX = ".jsonl";

export interface SmokeArtifactCredentialRegistry {
  readonly credentials: readonly string[];
  readonly invalidFiles: readonly string[];
}

export function registerSmokeArtifactCredential(credential: string): void {
  const dir = registryDir();
  const path = join(dir, `${REGISTRY_FILE_PREFIX}${String(process.pid)}${REGISTRY_FILE_SUFFIX}`);
  const fd = openRegistryFile(path, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY);
  try {
    appendFileSync(fd, `${JSON.stringify(credential)}\n`, "utf8");
  } finally {
    closeSync(fd);
  }
}

export function readSmokeArtifactCredentialRegistry(): SmokeArtifactCredentialRegistry {
  const dir = registryDir();
  const credentials: string[] = [];
  const invalidFiles: string[] = [];
  for (const filename of readdirSync(dir).filter(isRegistryFilename)) {
    try {
      credentials.push(...readCredentials(join(dir, filename)));
    } catch {
      invalidFiles.push(filename);
    }
  }
  return { credentials: [...new Set(credentials)], invalidFiles };
}

export function assertSmokeArtifactCredentialRegistryValid(
  registry: SmokeArtifactCredentialRegistry,
): void {
  if (registry.invalidFiles.length > 0) {
    throw new Error(
      `Preview smoke artifact credential registry contains invalid files: ${registry.invalidFiles.join(", ")}`,
    );
  }
}

export function clearSmokeArtifactCredentials(): void {
  rmSync(registryDir(), { force: true, recursive: true });
}

/**
 * The registry must never silently disable itself: a minted bearer that goes unregistered is
 * exactly the credential the artifact sweep exists to revoke and scan for (INS-586). When the env
 * override is absent, the mint and sweep processes (separate node invocations) fall back to the
 * same per-user path so they still agree without an env var — but under a private directory this
 * process owns, so the deterministic path cannot be redirected by a planted symlink.
 */
function registryDir(): string {
  const override = process.env[SMOKE_ARTIFACT_CREDENTIAL_REGISTRY_ENV];
  if (override !== undefined && override.trim() !== "") {
    return ensurePrivateRegistryDir(override);
  }
  return ensurePrivateRegistryDir(join(tmpdir(), DEFAULT_REGISTRY_DIRNAME));
}

/** Create (or adopt) a `0700` directory this user owns; refuse a symlinked or foreign one. */
function ensurePrivateRegistryDir(dir: string): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`smoke artifact credential registry dir ${dir} is not a real directory`);
  }
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new Error(`smoke artifact credential registry dir ${dir} is not owned by this user`);
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(`smoke artifact credential registry dir ${dir} is group- or world-accessible`);
  }
  return dir;
}

function openRegistryFile(path: string, flags: number): number {
  const fd = openSync(path, flags | constants.O_NOFOLLOW, 0o600);
  const stat = fstatSync(fd);
  if (!stat.isFile()) {
    closeSync(fd);
    throw new Error(`smoke artifact credential registry ${path} is not a regular file`);
  }
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    closeSync(fd);
    throw new Error(`smoke artifact credential registry ${path} is not owned by this user`);
  }
  if ((stat.mode & 0o077) !== 0) {
    closeSync(fd);
    throw new Error(`smoke artifact credential registry ${path} is group- or world-accessible`);
  }
  return fd;
}

function readCredentials(path: string): string[] {
  const fd = openRegistryFile(path, constants.O_RDONLY);
  try {
    const credentials = readFileSync(fd, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as unknown);
    for (const credential of credentials) {
      if (typeof credential !== "string" || credential === "") {
        throw new Error("invalid");
      }
    }
    return [...new Set(credentials as string[])];
  } catch {
    throw new Error("Preview smoke artifact credential registry is invalid");
  } finally {
    closeSync(fd);
  }
}

function isRegistryFilename(filename: string): boolean {
  return filename.startsWith(REGISTRY_FILE_PREFIX) && filename.endsWith(REGISTRY_FILE_SUFFIX);
}
