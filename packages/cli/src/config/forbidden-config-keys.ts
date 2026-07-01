import { FORBIDDEN_ENVELOPE_KEYS } from "@insecur/domain";

/** Keys that must never appear in committed or user CLI config. */
const FORBIDDEN_CONFIG_KEYS: readonly string[] = [
  ...FORBIDDEN_ENVELOPE_KEYS,
  "refreshToken",
  "accessToken",
  "sessionToken",
  "credential",
  "apiKey",
  "clientSecret",
  "deployKey",
  "oidcToken",
] as const;

const FORBIDDEN_CONFIG_KEY_SET = new Set<string>(FORBIDDEN_CONFIG_KEYS);

export function assertNoForbiddenConfigKeys(
  record: Record<string, unknown>,
  path = "config",
): void {
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_CONFIG_KEY_SET.has(key)) {
      throw new Error(`${path} must not contain forbidden key: ${key}`);
    }
    const value = record[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      assertNoForbiddenConfigKeys(value as Record<string, unknown>, `${path}.${key}`);
    }
  }
}
