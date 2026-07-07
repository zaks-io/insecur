import { readdir, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import {
  homeDotenvTarget,
  isHomeDotenvBasename,
  sshPrivateKeyTarget,
  type MachineScanTarget,
} from "./machine-locations.js";
import { mightBeSecretPath } from "./secret-paths.js";

const SSH_SKIP_NAMES = new Set([
  "authorized_keys",
  "config",
  "known_hosts",
  "known_hosts.old",
  "agent",
]);

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
): Promise<string | null> {
  try {
    const resolvedPath = await realpath(absolutePath);
    return isWithinHome(resolvedPath, canonicalHome) ? resolvedPath : null;
  } catch {
    return null;
  }
}

function isSshPrivateKeyCandidate(name: string): boolean {
  return !name.endsWith(".pub") && !SSH_SKIP_NAMES.has(name) && mightBeSecretPath(name);
}

async function appendResolvableTarget(
  targets: MachineScanTarget[],
  canonicalHome: string,
  absolutePath: string,
  target: MachineScanTarget,
): Promise<void> {
  const resolved = await resolvePathWithinHome(absolutePath, canonicalHome);
  if (resolved !== null) {
    targets.push(target);
  }
}

export async function listSshPrivateKeyTargets(
  homeDir: string,
  canonicalHome: string,
): Promise<{ readonly targets: readonly MachineScanTarget[]; readonly unreadable: boolean }> {
  const sshDir = join(homeDir, ".ssh");
  let dirEntries;
  try {
    dirEntries = await readdir(sshDir, { withFileTypes: true });
  } catch {
    return { targets: [], unreadable: true };
  }

  const targets: MachineScanTarget[] = [];
  for (const entry of dirEntries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue;
    }
    if (!isSshPrivateKeyCandidate(entry.name)) {
      continue;
    }
    const absolutePath = join(sshDir, entry.name);
    await appendResolvableTarget(
      targets,
      canonicalHome,
      absolutePath,
      sshPrivateKeyTarget(homeDir, entry.name),
    );
  }

  return { targets, unreadable: false };
}

export async function listHomeDotenvTargets(
  homeDir: string,
  canonicalHome: string,
): Promise<{ readonly targets: readonly MachineScanTarget[]; readonly unreadable: boolean }> {
  let dirEntries;
  try {
    dirEntries = await readdir(homeDir, { withFileTypes: true });
  } catch {
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
