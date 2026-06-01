import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadRepoEnvLocal,
  parseEnvAssignments,
  redactDatabaseUrl,
  redactDatabaseUrlsInText,
  requireDatabaseUrl,
  unquoteEnvValue,
} from "../../scripts/lib/env-local.mjs";

describe("env-local parser", () => {
  it("strips double quotes from assignment values", () => {
    expect(unquoteEnvValue('"postgres://user:pass@127.0.0.1:5432/db"')).toBe(
      "postgres://user:pass@127.0.0.1:5432/db",
    );
  });

  it("strips single quotes from assignment values", () => {
    expect(unquoteEnvValue("'postgres://user:pass@127.0.0.1:5432/db'")).toBe(
      "postgres://user:pass@127.0.0.1:5432/db",
    );
  });

  it("parses quoted DATABASE_URL assignments from env file content", () => {
    const assignments = parseEnvAssignments(`
      DATABASE_URL_RUNTIME="postgres://runtime:secret@127.0.0.1:5432/insecur_dev"
    `);
    expect(assignments).toEqual([
      {
        key: "DATABASE_URL_RUNTIME",
        value: "postgres://runtime:secret@127.0.0.1:5432/insecur_dev",
      },
    ]);
  });
});

describe("env-local redaction", () => {
  it("redacts credentials from postgres URLs", () => {
    expect(redactDatabaseUrl("postgres://runtime:secret@127.0.0.1:5432/insecur_dev")).toBe(
      "postgres://***:***@127.0.0.1:5432/insecur_dev",
    );
  });

  it("redacts known database URLs from error text", () => {
    const url = "postgres://runtime:secret@127.0.0.1:5432/insecur_dev";
    process.env.DATABASE_URL_RUNTIME = url;
    expect(redactDatabaseUrlsInText(`Invalid URL: ${url}`)).toBe(
      "Invalid URL: postgres://***:***@127.0.0.1:5432/insecur_dev",
    );
    Reflect.deleteProperty(process.env, "DATABASE_URL_RUNTIME");
  });
});

describe("loadRepoEnvLocal", () => {
  const saved = new Map<string, string | undefined>();

  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
    saved.clear();
  });

  function remember(key: string): void {
    if (!saved.has(key)) {
      saved.set(key, process.env[key]);
    }
  }

  it("does not overwrite existing DATABASE_URL_MIGRATION or DATABASE_URL_RUNTIME", () => {
    const dir = mkdtempSync(join(tmpdir(), "insecur-env-local-"));
    const envPath = join(dir, ".env.local");
    writeFileSync(
      envPath,
      [
        "DATABASE_URL_MIGRATION=postgres://stale:migration@127.0.0.1:5432/stale",
        "DATABASE_URL_RUNTIME=postgres://stale:runtime@127.0.0.1:5432/stale",
      ].join("\n"),
    );

    remember("DATABASE_URL_MIGRATION");
    remember("DATABASE_URL_RUNTIME");
    process.env.DATABASE_URL_MIGRATION = "postgres://override:migration@127.0.0.1:5432/override";
    process.env.DATABASE_URL_RUNTIME = "postgres://override:runtime@127.0.0.1:5432/override";

    loadRepoEnvLocal({ path: envPath });

    expect(process.env.DATABASE_URL_MIGRATION).toBe(
      "postgres://override:migration@127.0.0.1:5432/override",
    );
    expect(process.env.DATABASE_URL_RUNTIME).toBe(
      "postgres://override:runtime@127.0.0.1:5432/override",
    );

    rmSync(dir, { recursive: true, force: true });
  });

  it("loads DATABASE_URL keys from the file when process env is unset", () => {
    const dir = mkdtempSync(join(tmpdir(), "insecur-env-local-"));
    const envPath = join(dir, ".env.local");
    writeFileSync(
      envPath,
      'DATABASE_URL_RUNTIME="postgres://from-file:secret@127.0.0.1:5432/insecur_dev"',
    );

    remember("DATABASE_URL_RUNTIME");
    Reflect.deleteProperty(process.env, "DATABASE_URL_RUNTIME");

    loadRepoEnvLocal({ path: envPath });

    expect(process.env.DATABASE_URL_RUNTIME).toBe(
      "postgres://from-file:secret@127.0.0.1:5432/insecur_dev",
    );

    rmSync(dir, { recursive: true, force: true });
  });
});

describe("requireDatabaseUrl", () => {
  it("rejects quoted invalid URLs without echoing credentials", () => {
    process.env.DATABASE_URL_RUNTIME = '"not-a-valid-url"';
    expect(() => requireDatabaseUrl("DATABASE_URL_RUNTIME")).toThrow(
      /DATABASE_URL_RUNTIME is not a valid database URL/,
    );
    Reflect.deleteProperty(process.env, "DATABASE_URL_RUNTIME");
  });
});
