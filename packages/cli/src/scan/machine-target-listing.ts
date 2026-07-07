import { readdir, realpath } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join, sep } from "node:path";
import {
  homeDotenvTarget,
  isHomeDotenvBasename,
  sshPrivateKeyTarget,
  type MachineScanTarget,
} from "./machine-locations.js";

const SSH_SKIP_NAMES = new Set([
  "authorized_keys",
  "config",
  "known_hosts",
  "known_hosts.old",
  "agent",
]);

const SSH_PRIVATE_KEY_NAME_PATTERNS = [
  /^id_(?:rsa|dsa|ecdsa|ed25519)$/iu,
  /\.pem$/iu,
  /\.key$/iu,
] as const;

export type ResolveWithinHomeResult =
  | { readonly status: "resolved"; readonly path: string }
  | { readonly status: "missing" }
  | { readonly status: "unreadable" };

export function isFsEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isWithinHome(resolvedPath: string, canonicalHome: string): boolean {
  const normalizedResolved =
    resolvedPath.length > 1 && resolvedPath.endsWith(sep)
      ? resolvedPath.slice(0, -1)
      : resolvedPath;
  const normalizedHome =
    canonicalHome.length > 1 && canonicalHome.endsWith(sep)
      ? canonicalHome.slice(0, -1)
      : canonicalHome;

  return (
    normalizedResolved === normalizedHome ||
    normalizedResolved.startsWith(`${normalizedHome}${sep}`)
  );
}

export async function resolvePathWithinHome(
  absolutePath: string,
  canonicalHome: string,
): Promise<ResolveWithinHomeResult> {
  try {
    const resolvedPath = await realpath(absolutePath);
    if (!isWithinHome(resolvedPath, canonicalHome)) {
      return { status: "unreadable" };
    }
    return { status: "resolved", path: resolvedPath };
  } catch (error) {
    if (isFsEnoent(error)) {
      return { status: "missing" };
    }
    return { status: "unreadable" };
  }
}

function isSshPrivateKeyCandidate(name: string): boolean {
  if (name.endsWith(".pub") || SSH_SKIP_NAMES.has(name)) {
    return false;
  }
  return SSH_PRIVATE_KEY_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

async function appendResolvableTarget(
  targets: MachineScanTarget[],
  canonicalHome: string,
  absolutePath: string,
  target: MachineScanTarget,
): Promise<void> {
  const resolved = await resolvePathWithinHome(absolutePath, canonicalHome);
  if (resolved.status === "resolved") {
    targets.push(target);
  }
}

async function collectSshPrivateKeyTargets(
  homeDir: string,
  canonicalHome: string,
  dirEntries: readonly Dirent[],
): Promise<MachineScanTarget[]> {
  const targets: MachineScanTarget[] = [];
  const sshDir = join(homeDir, ".ssh");
  for (const entry of dirEntries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue;
    }
    if (!isSshPrivateKeyCandidate(entry.name)) {
      continue;
    }
    await appendResolvableTarget(
      targets,
      canonicalHome,
      join(sshDir, entry.name),
      sshPrivateKeyTarget(homeDir, entry.name),
    );
  }
  return targets;
}

export async function listSshPrivateKeyTargets(
  homeDir: string,
  canonicalHome: string,
): Promise<{ readonly targets: readonly MachineScanTarget[]; readonly unreadable: boolean }> {
  const sshDir = join(homeDir, ".ssh");
  let dirEntries;
  try {
    dirEntries = await readdir(sshDir, { withFileTypes: true });
  } catch (error) {
    if (isFsEnoent(error)) {
      return { targets: [], unreadable: false };
    }
    return { targets: [], unreadable: true };
  }

  const targets = await collectSshPrivateKeyTargets(homeDir, canonicalHome, dirEntries);
  return { targets, unreadable: false };
}

export async function listHomeDotenvTargets(
  homeDir: string,
  canonicalHome: string,
): Promise<{ readonly targets: readonly MachineScanTarget[]; readonly unreadable: boolean }> {
  let dirEntries;
  try {
    dirEntries = await readdir(homeDir, { withFileTypes: true });
  } catch (error) {
    if (isFsEnoent(error)) {
      return { targets: [], unreadable: false };
    }
    return { targets: [], unreadable: true };
  }

  const targets: MachineScanTarget[] = [];
  for (const entry of dirEntries) {
    if (!isHomeDotenvBasename(entry.name)) {
      continue;
    }
    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue;
    }
    const absolutePath = join(homeDir, entry.name);
    await appendResolvableTarget(
      targets,
      canonicalHome,
      absolutePath,
      homeDotenvTarget(homeDir, entry.name),
    );
  }

  return { targets, unreadable: false };
}
