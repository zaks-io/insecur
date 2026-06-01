import { describe, expect, it } from "vitest";
import {
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
    delete process.env.DATABASE_URL_RUNTIME;
  });
});

describe("requireDatabaseUrl", () => {
  it("rejects quoted invalid URLs without echoing credentials", () => {
    process.env.DATABASE_URL_RUNTIME = '"not-a-valid-url"';
    expect(() => requireDatabaseUrl("DATABASE_URL_RUNTIME")).toThrow(
      /DATABASE_URL_RUNTIME is not a valid database URL/,
    );
    delete process.env.DATABASE_URL_RUNTIME;
  });
});
