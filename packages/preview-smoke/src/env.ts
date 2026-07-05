import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface PreviewConfig {
  apiBaseUrl: string;
  databaseUrl: string;
  expectedSha: string;
  inviteeUserId: string;
  inviteeWorkosUserId: string;
  noScopeUserId: string;
  noScopeWorkosUserId: string;
  ownerUserId: string;
  ownerWorkosUserId: string;
  signingSecret: string;
  siteBaseUrl: string;
  webBaseUrl: string;
}

export function loadPreviewConfig(): PreviewConfig {
  loadLocalEnvFiles();
  const signingSecret = requireEnv("SMOKE_SESSION_SIGNING_SECRET", "SESSION_SIGNING_SECRET");
  return {
    apiBaseUrl: requireEnv("SMOKE_API_BASE_URL", "SMOKE_BASE_URL").replace(/\/$/u, ""),
    databaseUrl: requireEnv("PREVIEW_DATABASE_URL_MIGRATION"),
    expectedSha: requireEnv("SMOKE_EXPECTED_DEPLOY_SHA", "GITHUB_SHA"),
    inviteeUserId: requireEnv("SMOKE_INVITEE_ADMITTED_USER_ID"),
    inviteeWorkosUserId: requireEnv("SMOKE_INVITEE_WORKOS_USER_ID"),
    noScopeUserId: requireEnv("SMOKE_NO_SCOPE_ADMITTED_USER_ID"),
    noScopeWorkosUserId: requireEnv("SMOKE_NO_SCOPE_WORKOS_USER_ID"),
    ownerUserId: requireEnv("SMOKE_ADMITTED_USER_ID"),
    ownerWorkosUserId: requireEnv("SMOKE_WORKOS_USER_ID"),
    signingSecret,
    siteBaseUrl: requireEnv("SMOKE_SITE_BASE_URL").replace(/\/$/u, ""),
    webBaseUrl: requireEnv("SMOKE_WEB_BASE_URL").replace(/\/$/u, ""),
  };
}

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const localEnvFiles = [".env.preview", ".env.local"] as const;
const assignmentPattern = /^(\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

function loadLocalEnvFiles(): void {
  loadEnvFiles(localEnvFiles.map((name) => `${repoRoot}/${name}`));
}

export function loadEnvFiles(paths: readonly string[]): void {
  for (const path of paths) {
    if (!existsSync(path)) {
      continue;
    }

    for (const { key, value } of parseEnvAssignments(readFileSync(path, "utf8"))) {
      process.env[key] ??= value;
    }
  }
}

export function parseEnvAssignments(content: string): { key: string; value: string }[] {
  const assignments: { key: string; value: string }[] = [];
  for (const line of content.split(/\r\n|\r|\n/u)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const match = assignmentPattern.exec(line);
    if (!match) {
      continue;
    }

    assignments.push({ key: match[2] ?? "", value: unquoteEnvValue(match[3] ?? "") });
  }
  return assignments.filter((assignment) => assignment.key !== "");
}

function unquoteEnvValue(raw: string): string {
  const value = raw.trim();
  if (value === "") {
    return value;
  }

  if (value.startsWith('"')) {
    return unquoteDoubleQuotedEnvValue(value);
  }

  if (value.startsWith("'")) {
    return unquoteSingleQuotedEnvValue(value);
  }

  return stripInlineEnvComment(value);
}

function unquoteDoubleQuotedEnvValue(value: string): string {
  let output = "";
  for (let index = 1; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (char === "\\" && index + 1 < value.length) {
      output += unescapeDoubleQuotedEnvChar(value.charAt(index + 1));
      index += 1;
      continue;
    }
    if (char === '"') {
      return output;
    }
    output += char;
  }
  throw new Error("Unterminated double-quoted env value");
}

function unescapeDoubleQuotedEnvChar(value: string): string {
  return value === "n" ? "\n" : value === "r" ? "\r" : value === "t" ? "\t" : value;
}

function unquoteSingleQuotedEnvValue(value: string): string {
  const closing = value.indexOf("'", 1);
  if (closing === -1) {
    throw new Error("Unterminated single-quoted env value");
  }
  return value.slice(1, closing);
}

function stripInlineEnvComment(value: string): string {
  const hashIndex = value.indexOf("#");
  if (hashIndex !== -1) {
    return value.slice(0, hashIndex).trimEnd();
  }
  return value;
}

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value.trim() !== "") {
      return value;
    }
  }
  if (names.includes("SMOKE_SESSION_SIGNING_SECRET")) {
    throw new Error(
      `${names.join(" or ")} is required. Hosted preview smoke credentials must be signed with the same SESSION_SIGNING_SECRET deployed to API/Web. A random value only works for a local Worker stack if that exact value is also exported to the workers under test.`,
    );
  }
  throw new Error(`${names.join(" or ")} is required`);
}
