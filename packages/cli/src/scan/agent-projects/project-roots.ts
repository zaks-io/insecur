import { access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, parse, resolve, sep } from "node:path";

const MAX_ROOT_ASCENT = 12;

const PROJECT_ROOT_MARKERS = [
  ".git",
  ".insecur.json",
  "package.json",
  "pnpm-workspace.yaml",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "deno.json",
  "bun.lockb",
] as const;

async function pathIsReadable(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function hasProjectMarker(dir: string): Promise<boolean> {
  const results = await Promise.all(
    PROJECT_ROOT_MARKERS.map((marker) => pathIsReadable(join(dir, marker))),
  );
  return results.some(Boolean);
}

async function hasDotenvInDirectory(dir: string): Promise<boolean> {
  return (
    (await pathIsReadable(join(dir, ".env"))) || (await pathIsReadable(join(dir, ".env.local")))
  );
}

async function directoryForExistingPath(path: string): Promise<string | null> {
  const pathStat = await stat(path);
  if (pathStat.isDirectory()) {
    return path;
  }
  if (pathStat.isFile()) {
    return dirname(path);
  }
  return null;
}

async function nearestExistingDirectory(path: string): Promise<string | null> {
  let current = path;
  const root = parse(current).root;

  while (current !== root) {
    current = dirname(current);
    try {
      return await directoryForExistingPath(current);
    } catch {
      continue;
    }
  }

  return null;
}

async function initialDirectoryForPath(path: string): Promise<string | null> {
  const resolvedPath = resolve(path);

  try {
    return await directoryForExistingPath(resolvedPath);
  } catch {
    return nearestExistingDirectory(resolvedPath);
  }
}

function parentOf(dir: string): string | null {
  const parent = dirname(dir);
  return parent === dir ? null : parent;
}

async function projectRootsForPath(path: string): Promise<readonly string[]> {
  const startDir = await initialDirectoryForPath(path);
  if (startDir === null) {
    return [];
  }

  const roots: string[] = [];
  let current: string | null = startDir;
  let depth = 0;

  while (current !== null && depth <= MAX_ROOT_ASCENT) {
    if (await hasProjectMarker(current)) {
      roots.push(current);
    }
    current = parentOf(current);
    depth += 1;
  }

  if (roots.length === 0 && (await hasDotenvInDirectory(startDir))) {
    roots.push(startDir);
  }

  return roots;
}

function isWithinRoot(path: string, root: string): boolean {
  const normalizedPath = path.endsWith(sep) ? path.slice(0, -1) : path;
  const normalizedRoot = root.endsWith(sep) ? root.slice(0, -1) : root;
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${sep}`);
}

function collapseNestedRoots(roots: readonly string[]): readonly string[] {
  const unique = [...new Set(roots)].sort((a, b) => a.length - b.length);
  const kept: string[] = [];

  for (const root of unique) {
    if (root === parse(root).root) {
      continue;
    }
    if (kept.some((parent) => isWithinRoot(root, parent))) {
      continue;
    }
    kept.push(root);
  }

  return kept;
}

export async function discoverProjectRoots(paths: readonly string[]): Promise<readonly string[]> {
  const roots: string[] = [];

  for (const path of paths) {
    roots.push(...(await projectRootsForPath(path)));
  }

  return collapseNestedRoots(roots);
}
