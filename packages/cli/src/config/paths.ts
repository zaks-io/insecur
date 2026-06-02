import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const PROJECT_CONFIG_FILE = ".insecur.json";
export const USER_CONFIG_DIR = ".insecur";
export const USER_CONFIG_FILE = "config.json";

export function resolveProjectRoot(configDir: string | undefined): string {
  return path.resolve(configDir ?? process.cwd());
}

export function projectConfigPath(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_CONFIG_FILE);
}

export function userConfigPath(): string {
  return path.join(homedir(), USER_CONFIG_DIR, USER_CONFIG_FILE);
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
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
