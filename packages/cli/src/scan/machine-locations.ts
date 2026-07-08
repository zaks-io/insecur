import { homedir } from "node:os";
import { join } from "node:path";

/** Fixed files under the home directory (relative to home root). */
export const MACHINE_SCAN_FIXED_FILES = [
  ".aws/credentials",
  ".netrc",
  ".npmrc",
  ".docker/config.json",
] as const;

/** Shell rc files scanned for `export KEY=...` lines (key names only). */
export const MACHINE_SCAN_SHELL_RC_FILES = [
  ".bashrc",
  ".bash_profile",
  ".bash_login",
  ".profile",
  ".zshrc",
  ".zshenv",
  ".zprofile",
] as const;

/** Human-readable allowlist for help text and docs (paths use `~` prefix). */
export const MACHINE_SCAN_ALLOWLIST_LINES = [
  "~/.aws/credentials",
  "~/.netrc",
  "~/.npmrc",
  "~/.docker/config.json",
  "~/.ssh/ (private keys only: id_rsa, id_ed25519, *.pem, *.key — not .pub or config)",
  "~/.env and ~/.env.* in the home root only",
  "Shell rc files: .bashrc, .bash_profile, .bash_login, .profile, .zshrc, .zshenv, .zprofile (export key names only)",
] as const;

export const MACHINE_SCAN_HELP = [
  "Also scan documented well-known credential locations in the home directory (opt-in, read-only):",
  ...MACHINE_SCAN_ALLOWLIST_LINES.map((line) => `  - ${line}`),
].join("\n");

type MachineScanTargetKind = "fixed-file" | "home-dotenv" | "shell-rc" | "ssh-private-key";

export interface MachineScanTarget {
  readonly displayPath: string;
  readonly absolutePath: string;
  readonly kind: MachineScanTargetKind;
}

export function resolveScanHomeDir(override?: string): string {
  if (override !== undefined && override.length > 0) {
    return override;
  }
  const fromEnv = process.env.HOME ?? process.env.USERPROFILE;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return homedir();
}

function toDisplayPath(homeDir: string, absolutePath: string): string {
  if (absolutePath === homeDir) {
    return "~";
  }
  if (absolutePath.startsWith(`${homeDir}/`)) {
    return `~/${absolutePath.slice(homeDir.length + 1)}`;
  }
  return absolutePath;
}

function isHomeDotenvBasename(name: string): boolean {
  return name === ".env" || name.startsWith(".env.");
}

export function listMachineScanTargets(homeDir: string): readonly MachineScanTarget[] {
  const targets: MachineScanTarget[] = [];

  for (const relative of MACHINE_SCAN_FIXED_FILES) {
    const absolutePath = join(homeDir, relative);
    targets.push({
      displayPath: toDisplayPath(homeDir, absolutePath),
      absolutePath,
      kind: "fixed-file",
    });
  }

  for (const basename of MACHINE_SCAN_SHELL_RC_FILES) {
    const absolutePath = join(homeDir, basename);
    targets.push({
      displayPath: toDisplayPath(homeDir, absolutePath),
      absolutePath,
      kind: "shell-rc",
    });
  }

  return targets;
}

export function sshPrivateKeyTarget(homeDir: string, fileName: string): MachineScanTarget {
  const absolutePath = join(homeDir, ".ssh", fileName);
  return {
    displayPath: toDisplayPath(homeDir, absolutePath),
    absolutePath,
    kind: "ssh-private-key",
  };
}

export function homeDotenvTarget(homeDir: string, fileName: string): MachineScanTarget {
  const absolutePath = join(homeDir, fileName);
  return {
    displayPath: toDisplayPath(homeDir, absolutePath),
    absolutePath,
    kind: "home-dotenv",
  };
}

export { isHomeDotenvBasename };
