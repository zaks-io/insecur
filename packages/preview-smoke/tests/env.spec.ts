import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { loadEnvFiles, parseEnvAssignments } from "../src/env";

test("local env files load without overriding shell values @preview", () => {
  const dir = mkdtempSync(join(tmpdir(), "insecur-preview-smoke-env-"));
  const previewPath = join(dir, ".env.preview");
  const localPath = join(dir, ".env.local");
  const keys = ["SESSION_SIGNING_SECRET", "SMOKE_API_BASE_URL", "SMOKE_SITE_BASE_URL"] as const;
  const saved = new Map(keys.map((key) => [key, process.env[key]]));

  try {
    process.env.SESSION_SIGNING_SECRET = "from-shell";
    Reflect.deleteProperty(process.env, "SMOKE_API_BASE_URL");
    Reflect.deleteProperty(process.env, "SMOKE_SITE_BASE_URL");

    writeFileSync(
      previewPath,
      [
        'export SESSION_SIGNING_SECRET="from-preview"',
        "SMOKE_API_BASE_URL=https://api.preview.example",
        "SMOKE_SITE_BASE_URL=https://site.preview.example",
      ].join("\n"),
    );
    writeFileSync(
      localPath,
      [
        "SESSION_SIGNING_SECRET=from-local",
        "SMOKE_API_BASE_URL=https://api.local.example",
        "SMOKE_SITE_BASE_URL=https://site.local.example",
      ].join("\n"),
    );

    loadEnvFiles([previewPath, localPath]);

    expect(process.env.SESSION_SIGNING_SECRET).toBe("from-shell");
    expect(process.env.SMOKE_API_BASE_URL).toBe("https://api.preview.example");
    expect(process.env.SMOKE_SITE_BASE_URL).toBe("https://site.preview.example");
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        process.env[key] = value;
      }
    }
    rmSync(dir, { force: true, recursive: true });
  }
});

test("local env parser supports quoted assignments and inline comments @preview", () => {
  expect(
    parseEnvAssignments(`
      export SMOKE_SESSION_SIGNING_SECRET="quoted secret"
      SMOKE_WEB_BASE_URL=https://app.preview.example # local note
      SMOKE_SITE_BASE_URL='https://site.preview.example'
    `),
  ).toEqual([
    { key: "SMOKE_SESSION_SIGNING_SECRET", value: "quoted secret" },
    { key: "SMOKE_WEB_BASE_URL", value: "https://app.preview.example" },
    { key: "SMOKE_SITE_BASE_URL", value: "https://site.preview.example" },
  ]);
});
