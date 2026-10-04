import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { userAdmissionId, userId } from "@insecur/domain";
import postgres from "postgres";
import { loadRepoEnvLocal, parseEnvAssignments, requireDatabaseUrl } from "./lib/env-local.mjs";

const root = resolve(import.meta.dirname, "../../..");
const { values } = parseArgs({
  options: { name: { type: "string" }, "display-name": { type: "string" } },
});
if (!values.name || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(values.name)) {
  throw new Error("Use --name with 1-64 lowercase letters, digits or hyphens");
}
const displayName = values["display-name"]?.trim() || values.name;
if (displayName.length > 120) throw new Error("Display name must be at most 120 characters");
const subject = `user_local_${values.name}`;
loadRepoEnvLocal();
const databaseUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION");
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("dev:account only writes to loopback Postgres");
}
const varsPath = resolve(root, "apps/web/.dev.vars");
const varsText = readFileSync(varsPath, "utf8");
const vars = Object.fromEntries(
  parseEnvAssignments(varsText).map(({ key, value }) => [key, value]),
);
if (!vars.INSTANCE_ID) throw new Error("apps/web/.dev.vars requires INSTANCE_ID");
if (!vars.SESSION_SIGNING_SECRET || vars.SESSION_SIGNING_SECRET.trim().length < 32) {
  throw new Error(
    "apps/web/.dev.vars requires a local SESSION_SIGNING_SECRET of at least 32 characters",
  );
}
const accounts: { subject: string; displayName: string }[] = JSON.parse(
  vars.LOCAL_DEV_ACCOUNTS_JSON ?? "[]",
);
if (!Array.isArray(accounts)) throw new Error("LOCAL_DEV_ACCOUNTS_JSON must be an array");
const sql = postgres(databaseUrl, { prepare: false, max: 1 });
try {
  await sql.begin(async (tx) => {
    await tx`INSERT INTO instances (id, display_name) VALUES (${vars.INSTANCE_ID}, ${"Local development"}) ON CONFLICT (id) DO NOTHING`;
    await tx`
      INSERT INTO user_admissions (id, instance_id, user_id, workos_user_id, display_name, status)
      VALUES (${userAdmissionId.generate()}, ${vars.INSTANCE_ID}, ${userId.generate()}, ${subject}, ${displayName}, 'active')
      ON CONFLICT (instance_id, workos_user_id) DO UPDATE
      SET display_name = EXCLUDED.display_name, status = 'active', revoked_at = NULL, updated_at = now()
    `;
  });
} finally {
  await sql.end({ timeout: 5 });
}
const updated = [
  ...accounts.filter((account) => account.subject !== subject),
  { subject, displayName },
];
// Single quotes preserve JSON's double quotes in Wrangler's dotenv parser.
const assignment = `LOCAL_DEV_ACCOUNTS_JSON='${JSON.stringify(updated).replaceAll("'", "\\u0027")}'`;
const lines = varsText
  .split(/\r?\n/)
  .filter((line) => !/^\s*(?:export\s+)?LOCAL_DEV_ACCOUNTS_JSON\s*=/.test(line));
writeFileSync(varsPath, `${lines.join("\n").trimEnd()}\n${assignment}\n`, { mode: 0o600 });
console.log(`Local account ${displayName} is ready. Restart Web dev, then select it at /login.`);
