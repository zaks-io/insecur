import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readJsonFile(absolutePath: string): unknown {
  try {
    const raw = readFileSync(absolutePath, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function evidencePath(evidenceDir: string, ...segments: string[]): string {
  return join(evidenceDir, ...segments);
}

export function parseJsonEvidence<T>(
  absolutePath: string,
  parse: (value: unknown) => T | null,
): T | null {
  const raw = readJsonFile(absolutePath);
  return raw !== null ? parse(raw) : null;
}
