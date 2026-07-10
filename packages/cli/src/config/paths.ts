import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const PROJECT_CONFIG_FILE = ".insecur.json";
const USER_CONFIG_DIR = ".insecur";
export const USER_CONFIG_FILE = "config.json";

export function resolveProjectRoot(configDir: string | undefined): string {
  return path.resolve(configDir ?? process.cwd());
}

export function projectConfigPath(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_CONFIG_FILE);
}

export function resolveUserConfigHome(): string {
  const override = process.env.INSECUR_CONFIG_HOME;
  if (override !== undefined && override !== "") {
    return override;
  }
  const home = process.env.HOME;
  if (home !== undefined && home !== "") {
    return home;
  }
  const userProfile = process.env.USERPROFILE;
  if (userProfile !== undefined && userProfile !== "") {
    return userProfile;
  }
  return homedir();
}

export function resolveUserConfigDir(): string {
  return path.join(resolveUserConfigHome(), USER_CONFIG_DIR);
}

export function userConfigPath(): string {
  return path.join(resolveUserConfigDir(), USER_CONFIG_FILE);
}

function isENOENT(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`invalid JSON object in ${filePath}`);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (isENOENT(error)) {
      return null;
    }
    throw error;
  }
}

export async function writeJsonFile(
  filePath: string,
  value: Record<string, unknown>,
  options: { readonly mode?: number } = {},
): Promise<void> {
  const directory = path.dirname(filePath);
  await mkdir(directory, {
    recursive: true,
    ...(options.mode === 0o600 ? { mode: 0o700 } : {}),
  });
  if (options.mode === 0o600) {
    await chmod(directory, 0o700);
  }
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    ...(options.mode === undefined ? {} : { mode: options.mode }),
  });
  if (options.mode !== undefined) {
    await chmod(filePath, options.mode);
  }
}
