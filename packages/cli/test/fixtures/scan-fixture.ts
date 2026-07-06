import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Obviously fake sentinel — must not resemble real secret prefixes. */
export const SENTINEL_SECRET_VALUE = "SENTINEL_SCAN_TEST_VALUE_ALPHA_9f2c4e";
export const SENTINEL_LOCAL_VALUE = "SENTINEL_SCAN_TEST_VALUE_BETA_7d1a8b";
export const SENTINEL_DECOY_VALUE = "SENTINEL_SCAN_DECOY_MUST_NOT_APPEAR";

/** Non-cryptographic placeholder; `.pem` extension drives private-key-file classification. */
const PEM_FIXTURE_BODY = "SENTINEL_PEM_FIXTURE_METADATA_ONLY_NOT_A_REAL_KEY\n";

async function writeDecoyFiles(rootDir: string): Promise<void> {
  const decoyEnv = `DECOY_API_SECRET=${SENTINEL_DECOY_VALUE}\n`;
  await mkdir(join(rootDir, "node_modules", "planted-decoy"), { recursive: true });
  await mkdir(join(rootDir, ".git", "planted-decoy"), { recursive: true });
  await writeFile(join(rootDir, "node_modules", "planted-decoy", ".env"), decoyEnv, "utf8");
  await writeFile(join(rootDir, ".git", "planted-decoy", ".env"), decoyEnv, "utf8");
}

export async function writeScanFixtureTree(rootDir: string): Promise<void> {
  await writeFile(
    join(rootDir, ".gitignore"),
    ["node_modules/", ".env", "dist/"].join("\n"),
    "utf8",
  );

  await writeFile(
    join(rootDir, ".env"),
    [
      "NODE_ENV=development",
      "PORT=3000",
      `API_SECRET=${SENTINEL_SECRET_VALUE}`,
      "PUBLIC_URL=https://example.test",
      "FEATURE_FLAG=true",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    join(rootDir, ".env.local"),
    [`DATABASE_PASSWORD=${SENTINEL_LOCAL_VALUE}`].join("\n"),
    "utf8",
  );

  await writeFile(join(rootDir, "private-key.pem"), PEM_FIXTURE_BODY, "utf8");
  await writeFile(
    join(rootDir, "service-account.json"),
    JSON.stringify(
      {
        type: "service_account",
        project_id: "sentinel-fixture-project",
        private_key_id: "sentinel-key-id",
        client_email: "sentinel@fixture.test",
        client_id: "000000000000",
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeDecoyFiles(rootDir);
}
