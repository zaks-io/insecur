import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Obviously fake sentinel — must not resemble real secret prefixes. */
export const MACHINE_SENTINEL_SECRET_VALUE = "SENTINEL_MACHINE_SCAN_ALPHA_9f2c4e";
export const MACHINE_SENTINEL_EXPORT_VALUE = "SENTINEL_MACHINE_SCAN_BETA_7d1a8b";

const PEM_FIXTURE_BODY = "SENTINEL_MACHINE_PEM_METADATA_ONLY_NOT_A_REAL_KEY\n";

async function writeFixedMachineFiles(homeDir: string): Promise<void> {
  await mkdir(join(homeDir, ".aws"), { recursive: true });
  await mkdir(join(homeDir, ".docker"), { recursive: true });
  await mkdir(join(homeDir, ".ssh"), { recursive: true });

  await writeFile(
    join(homeDir, ".aws", "credentials"),
    [
      "[default]",
      `aws_access_key_id = ${MACHINE_SENTINEL_SECRET_VALUE}`,
      `aws_secret_access_key = ${MACHINE_SENTINEL_EXPORT_VALUE}`,
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(homeDir, ".netrc"),
    `machine api.example.test login user password ${MACHINE_SENTINEL_SECRET_VALUE}\n`,
    "utf8",
  );
  await writeFile(join(homeDir, ".npmrc"), `_authToken=${MACHINE_SENTINEL_SECRET_VALUE}\n`, "utf8");
  await writeFile(
    join(homeDir, ".docker", "config.json"),
    JSON.stringify({ auths: { "registry.example.test": { auth: MACHINE_SENTINEL_SECRET_VALUE } } }),
    "utf8",
  );
}

async function writeSshAndShellFixtures(homeDir: string): Promise<void> {
  const border = "-".repeat(5);
  await writeFile(
    join(homeDir, ".ssh", "id_ed25519"),
    [
      `${border}BEGIN PRIVATE KEY${border}`,
      PEM_FIXTURE_BODY,
      `${border}END PRIVATE KEY${border}`,
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(homeDir, ".ssh", "id_ed25519.pub"),
    "ssh-ed25519 AAAA... sentinel\n",
    "utf8",
  );
  await writeFile(
    join(homeDir, ".env"),
    [`HOME_ROOT_SECRET=${MACHINE_SENTINEL_SECRET_VALUE}`].join("\n"),
    "utf8",
  );
  await writeFile(
    join(homeDir, ".zshrc"),
    [
      "# benign",
      `export API_TOKEN=${MACHINE_SENTINEL_EXPORT_VALUE}`,
      "export PATH=/usr/bin",
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function writeMachineScanFixtureHome(homeDir: string): Promise<void> {
  await writeFixedMachineFiles(homeDir);
  await writeSshAndShellFixtures(homeDir);
}
