#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SKIP_DIRS = new Set([
  ".codex",
  ".git",
  ".jscpd-report",
  ".turbo",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
  "reports",
]);

const PRIVATE_ENV_FILE = /^(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?)$/u;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export function parseArgs(argv) {
  const options = {
    dryRun: false,
    force: true,
    install: true,
    resetDb: false,
    runDevCheck: true,
    source: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--":
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--no-overwrite":
        options.force = false;
        break;
      case "--skip-install":
        options.install = false;
        break;
      case "--skip-dev-check":
        options.runDevCheck = false;
        break;
      case "--reset-db":
        options.resetDb = true;
        break;
      case "--source":
        options.source = requireValue(argv, index);
        index += 1;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function parseWorktreeList(output) {
  const records = [];

  for (const block of output.trim().split(/\n\n/u)) {
    if (!block) {
      continue;
    }
    const record = {};
    for (const line of block.split("\n")) {
      const [key, ...rest] = line.split(" ");
      record[key] = rest.join(" ");
    }
    records.push(record);
  }

  return records;
}

export function selectSourceWorktree(records) {
  return records.find((record) => record.worktree)?.worktree;
}

export function discoverPrivateEnvFiles(root) {
  const files = [];

  walk(root, "");
  return files.sort((left, right) => left.localeCompare(right));

  function walk(base, relativeDir) {
    const absoluteDir = path.join(base, relativeDir);
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name, relativeDir)) {
          continue;
        }
        walk(base, path.join(relativeDir, entry.name));
        continue;
      }
      if (!entry.isFile() || !isPrivateEnvFile(entry.name)) {
        continue;
      }
      files.push(path.join(relativeDir, entry.name));
    }
  }
}

export function isPrivateEnvFile(fileName) {
  return PRIVATE_ENV_FILE.test(fileName) && !fileName.endsWith(".example");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const targetRoot = git(["rev-parse", "--show-toplevel"]).stdout.trim();
  const sourceRoot = path.resolve(options.source ?? findSourceWorktree());

  if (path.resolve(sourceRoot) === path.resolve(targetRoot)) {
    log("Source worktree is this worktree; env copy skipped.");
  } else {
    copyEnvFiles({ sourceRoot, targetRoot, options });
  }

  if (options.install) {
    run(["pnpm", "install", "--frozen-lockfile"], { cwd: targetRoot, dryRun: options.dryRun });
  } else {
    log("Install skipped.");
  }

  if (options.runDevCheck) {
    run(["pnpm", "dev:check"], { cwd: targetRoot, dryRun: options.dryRun });
  } else {
    log("dev:check skipped.");
  }

  if (options.resetDb) {
    run(["pnpm", "dev:db:reset"], { cwd: targetRoot, dryRun: options.dryRun });
  }

  log("Worktree setup complete.");
}

function findSourceWorktree() {
  const output = git(["worktree", "list", "--porcelain"]).stdout;
  const source = selectSourceWorktree(parseWorktreeList(output));
  if (!source) {
    throw new Error("Could not find a source worktree.");
  }
  return source;
}

function copyEnvFiles({ sourceRoot, targetRoot, options }) {
  const envFiles = discoverPrivateEnvFiles(sourceRoot);
  if (envFiles.length === 0) {
    log(`No private env files found in ${sourceRoot}.`);
    return;
  }

  const backupRoot = git(["rev-parse", "--git-path", "worktree-env-backups"], {
    cwd: targetRoot,
  }).stdout.trim();
  const backupStamp = new Date().toISOString().replace(/[:.]/gu, "-");

  let copied = 0;
  let skipped = 0;
  for (const relativePath of envFiles) {
    const sourcePath = path.join(sourceRoot, relativePath);
    const targetPath = path.join(targetRoot, relativePath);
    const targetExists = existsSync(targetPath);

    if (targetExists && sameFileContents(sourcePath, targetPath)) {
      skipped += 1;
      log(`unchanged ${relativePath}`);
      continue;
    }
    if (targetExists && !options.force) {
      skipped += 1;
      log(`exists ${relativePath}`);
      continue;
    }

    if (options.dryRun) {
      copied += 1;
      log(`${targetExists ? "would update" : "would copy"} ${relativePath}`);
      continue;
    }

    if (targetExists) {
      const backupPath = path.join(backupRoot, backupStamp, relativePath);
      mkdirSync(path.dirname(backupPath), { recursive: true });
      copyFileSync(targetPath, backupPath);
      chmodSync(backupPath, privateFileMode(targetPath));
    }

    mkdirSync(path.dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
    chmodSync(targetPath, privateFileMode(sourcePath));
    copied += 1;
    log(`${targetExists ? "updated" : "copied"} ${relativePath}`);
  }

  log(`Env copy complete: ${copied} copied, ${skipped} skipped.`);
}

function sameFileContents(left, right) {
  return readFileSync(left).equals(readFileSync(right));
}

function privateFileMode(filePath) {
  return statSync(filePath).mode & 0o700 || 0o600;
}

function shouldSkipDir(name, relativeDir) {
  if (relativeDir === ".claude" && name === "worktrees") {
    return true;
  }
  return SKIP_DIRS.has(name);
}

function run(command, { cwd, dryRun }) {
  log(`${dryRun ? "would run" : "run"} ${command.join(" ")}`);
  if (dryRun) {
    return;
  }
  const result = spawnSync(command[0], command.slice(1), { cwd, stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result;
}

function requireValue(argv, index) {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${argv[index]} requires a value`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage: pnpm setup:worktree [options]

Copies private env files from the main/root worktree into this worktree, then installs dependencies
and runs the local setup check.

Options:
  --source <path>     Copy env files from a specific worktree instead of auto-detecting main.
  --dry-run           Show actions without copying files or running setup commands.
  --no-overwrite      Do not overwrite existing env files in this worktree.
  --skip-install      Skip pnpm install --frozen-lockfile.
  --skip-dev-check    Skip pnpm dev:check.
  --reset-db          Run pnpm dev:db:reset after dev:check.
`);
}

function log(message) {
  console.log(`[setup-worktree] ${message}`);
}
