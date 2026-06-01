import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const repoEnvLocalPath = join(packageRoot, "..", "..", ".env.local");

export const DATABASE_URL_ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_MIGRATION",
  "DATABASE_URL_RUNTIME",
];

const assignmentPattern = /^(\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/**
 * Dotenv-compatible unquoting for assignment values.
 */
export function unquoteEnvValue(raw) {
  let value = raw.trim();
  if (value === "") {
    return value;
  }

  if (value.startsWith('"')) {
    let index = 1;
    let output = "";
    while (index < value.length) {
      const char = value[index];
      if (char === "\\" && index + 1 < value.length) {
        const next = value[index + 1];
        if (next === "n") {
          output += "\n";
        } else if (next === "r") {
          output += "\r";
        } else if (next === "t") {
          output += "\t";
        } else {
          output += next;
        }
        index += 2;
        continue;
      }
      if (char === '"') {
        return output;
      }
      output += char;
      index += 1;
    }
    throw new Error("Unterminated double-quoted env value");
  }

  if (value.startsWith("'")) {
    const closing = value.indexOf("'", 1);
    if (closing === -1) {
      throw new Error("Unterminated single-quoted env value");
    }
    return value.slice(1, closing);
  }

  const hashIndex = value.indexOf("#");
  if (hashIndex !== -1) {
    value = value.slice(0, hashIndex).trimEnd();
  }
  return value;
}

export function parseEnvAssignments(content) {
  const assignments = [];
  for (const line of content.split(/\r\n|\r|\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const match = assignmentPattern.exec(line);
    if (!match) {
      continue;
    }

    const key = match[2];
    const rawValue = match[3] ?? "";
    assignments.push({ key, value: unquoteEnvValue(rawValue) });
  }
  return assignments;
}

export function repoEnvLocalFilePath() {
  return repoEnvLocalPath;
}

export function loadRepoEnvLocal(options = {}) {
  const path = options.path ?? repoEnvLocalPath;
  if (!existsSync(path)) {
    normalizeDatabaseUrlEnv();
    return { loaded: false, path };
  }

  const assignments = parseEnvAssignments(readFileSync(path, "utf8"));
  for (const { key, value } of assignments) {
    if (DATABASE_URL_ENV_KEYS.includes(key)) {
      process.env[key] = value;
      continue;
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  normalizeDatabaseUrlEnv();
  return { loaded: true, path };
}

export function normalizeDatabaseUrlEnv() {
  for (const key of DATABASE_URL_ENV_KEYS) {
    const raw = process.env[key];
    if (raw !== undefined) {
      process.env[key] = unquoteEnvValue(raw);
    }
  }
}

export function collectDatabaseUrlEnvValues() {
  const values = [];
  for (const key of DATABASE_URL_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) {
      values.push({ key, value });
    }
  }
  return values;
}

export function redactDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "***";
    }
    if (parsed.username) {
      parsed.username = parsed.username.length > 0 ? "***" : "";
    }
    return parsed.toString();
  } catch {
    return "<redacted database url>";
  }
}

export function redactDatabaseUrlsInText(text) {
  if (text === undefined || text === null) {
    return "";
  }

  let output = String(text);
  for (const { value } of collectDatabaseUrlEnvValues()) {
    if (value.length > 0) {
      output = output.split(value).join(redactDatabaseUrl(value));
    }
  }

  output = output.replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, (match) =>
    redactDatabaseUrl(match),
  );
  return output;
}

export function redactLoggableError(error) {
  if (error instanceof Error) {
    const message = redactDatabaseUrlsInText(error.message);
    const stack = error.stack ? redactDatabaseUrlsInText(error.stack) : undefined;
    if (stack && stack !== message) {
      return stack;
    }
    return message;
  }
  return redactDatabaseUrlsInText(error);
}

export function requireDatabaseUrl(...keys) {
  for (const key of keys) {
    const raw = process.env[key]?.trim();
    if (!raw) {
      continue;
    }

    const value = unquoteEnvValue(raw);
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
        throw new Error(`${key} must use postgres:// or postgresql://`);
      }
      process.env[key] = value;
      return value;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${key} is not a valid database URL (${detail})`);
    }
  }

  throw new Error(
    `One of ${keys.join(", ")} is required. Set it in the environment or repo .env.local.`,
  );
}
