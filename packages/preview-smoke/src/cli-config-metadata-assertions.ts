import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { asRecord, assertEqual, type JsonRecord } from "./http";
import {
  assertExactKeys,
  assertJsonTreeMetadataOnly,
  assertOpaqueIdWithPrefix,
  assertSafeDisplayLabel,
  assertSurfaceTextMetadataOnly,
  type SensitiveMaterial,
} from "./cli-metadata-only-scan";

/**
 * INS-368: positive, structural metadata-only assertions over the config
 * files the First Value CLI flow writes (`insecur init`), on top of the
 * redactor-based absence checks in cli-smoke.ts. File names mirror
 * `@insecur/cli` config paths and `@insecur/local-store` keystore paths
 * (duplicated so preview-smoke stays off those packages' dependency graphs).
 */

const PROJECT_CONFIG_FILE = ".insecur.json";
const USER_CONFIG_FILE = ".insecur/config.json";
const MACHINE_ROOT_KEY_FILE = ".insecur/machine-root-key";

/**
 * Every file the First Value CLI flow may legitimately create under the
 * isolated INSECUR_CONFIG_HOME. The machine-root-key entries are the
 * file-fallback keystore (`INSECUR_ALLOW_INSECURE_FILE_KEYSTORE=1` is set for
 * the CLI child): the key FILE is expected, but its material must never
 * appear in config files or CLI output. Anything else (session caches, raw
 * API response dumps, grant payloads) fails the smoke.
 */
const CONFIG_HOME_FILE_ALLOWLIST = new Set([
  USER_CONFIG_FILE,
  MACHINE_ROOT_KEY_FILE,
  ".insecur/machine-root-key.dpapi",
  ".insecur/.machine-root-key-v1.create.lock",
]);

const MACHINE_ROOT_KEY_HEX_PATTERN = /^[0-9a-f]{64}$/i;

export interface CliSmokeWorkspaceDirs {
  readonly configDir: string;
  readonly configHomeDir: string;
}

export interface CliConfigSurfaces {
  readonly projectConfigRaw: string;
  readonly projectConfig: JsonRecord;
  readonly userConfigRaw: string;
  readonly userConfig: JsonRecord;
  /** Relative posix paths of every file in the project config dir. */
  readonly configDirFiles: readonly string[];
  /** Relative posix paths of every file under INSECUR_CONFIG_HOME. */
  readonly configHomeFiles: readonly string[];
  /** File-fallback keystore material when the key file exists; scanned for, never logged. */
  readonly machineRootKeyMaterial?: SensitiveMaterial;
}

async function listFilesRecursive(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
    )
    .sort();
}

async function readWorkspaceJsonFile(
  filePath: string,
  label: string,
): Promise<{ raw: string; record: JsonRecord }> {
  const raw = await readFile(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  return { raw, record: asRecord(parsed, label) };
}

async function readMachineRootKeyMaterial(
  configHomeDir: string,
  configHomeFiles: readonly string[],
): Promise<SensitiveMaterial | undefined> {
  if (!configHomeFiles.includes(MACHINE_ROOT_KEY_FILE)) {
    return undefined;
  }
  const contents = (await readFile(path.join(configHomeDir, MACHINE_ROOT_KEY_FILE), "utf8")).trim();
  if (!MACHINE_ROOT_KEY_HEX_PATTERN.test(contents)) {
    // Deliberately shape-only: never echo the file contents.
    throw new Error(`${MACHINE_ROOT_KEY_FILE} does not hold a 64-char hex machine root key`);
  }
  return { name: "machine root key material", value: contents };
}

export async function readCliConfigSurfaces(
  workspace: CliSmokeWorkspaceDirs,
): Promise<CliConfigSurfaces> {
  const [configDirFiles, configHomeFiles] = await Promise.all([
    listFilesRecursive(workspace.configDir),
    listFilesRecursive(workspace.configHomeDir),
  ]);
  const projectConfig = await readWorkspaceJsonFile(
    path.join(workspace.configDir, PROJECT_CONFIG_FILE),
    PROJECT_CONFIG_FILE,
  );
  const userConfig = await readWorkspaceJsonFile(
    path.join(workspace.configHomeDir, USER_CONFIG_FILE),
    USER_CONFIG_FILE,
  );
  const machineRootKeyMaterial = await readMachineRootKeyMaterial(
    workspace.configHomeDir,
    configHomeFiles,
  );
  return {
    projectConfigRaw: projectConfig.raw,
    projectConfig: projectConfig.record,
    userConfigRaw: userConfig.raw,
    userConfig: userConfig.record,
    configDirFiles,
    configHomeFiles,
    ...(machineRootKeyMaterial === undefined ? {} : { machineRootKeyMaterial }),
  };
}

export interface CliFirstValueConfigIdentity {
  readonly organizationId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly profileId: string;
}

function assertProjectConfigMetadataOnly(
  record: JsonRecord,
  apiBaseUrl: string,
): CliFirstValueConfigIdentity {
  assertExactKeys(
    record,
    { required: ["host", "orgId", "projectId", "defaultEnvId", "profileId"] },
    PROJECT_CONFIG_FILE,
  );
  assertEqual(record.host, apiBaseUrl, `${PROJECT_CONFIG_FILE} host`);
  return {
    organizationId: assertOpaqueIdWithPrefix(record.orgId, "org", `${PROJECT_CONFIG_FILE} orgId`),
    projectId: assertOpaqueIdWithPrefix(
      record.projectId,
      "prj",
      `${PROJECT_CONFIG_FILE} projectId`,
    ),
    environmentId: assertOpaqueIdWithPrefix(
      record.defaultEnvId,
      "env",
      `${PROJECT_CONFIG_FILE} defaultEnvId`,
    ),
    profileId: assertOpaqueIdWithPrefix(
      record.profileId,
      "prof",
      `${PROJECT_CONFIG_FILE} profileId`,
    ),
  };
}

function assertUserConfigMetadataOnly(
  record: JsonRecord,
  identity: CliFirstValueConfigIdentity,
  apiBaseUrl: string,
): void {
  assertExactKeys(record, { required: ["profiles"], optional: ["crashReports"] }, USER_CONFIG_FILE);
  const profiles = asRecord(record.profiles, `${USER_CONFIG_FILE} profiles`);
  assertEqual(
    Object.keys(profiles).join(","),
    identity.profileId,
    `${USER_CONFIG_FILE} profile ids`,
  );
  const profileLabel = `${USER_CONFIG_FILE} profiles.${identity.profileId}`;
  const profile = asRecord(profiles[identity.profileId], profileLabel);
  assertExactKeys(
    profile,
    {
      required: ["slug", "displayName", "host", "orgId", "projectId", "envId"],
      optional: ["defaultRunPolicyId"],
    },
    profileLabel,
  );
  assertSafeDisplayLabel(profile.slug, `${profileLabel} slug`);
  assertSafeDisplayLabel(profile.displayName, `${profileLabel} displayName`);
  assertEqual(profile.host, apiBaseUrl, `${profileLabel} host`);
  assertEqual(profile.orgId, identity.organizationId, `${profileLabel} orgId`);
  assertEqual(profile.projectId, identity.projectId, `${profileLabel} projectId`);
  assertEqual(profile.envId, identity.environmentId, `${profileLabel} envId`);
  if (profile.defaultRunPolicyId !== undefined) {
    assertOpaqueIdWithPrefix(
      profile.defaultRunPolicyId,
      "rp",
      `${profileLabel} defaultRunPolicyId`,
    );
  }
}

export interface CliConfigSurfaceAssertionInput {
  readonly surfaces: CliConfigSurfaces;
  readonly label: string;
  readonly apiBaseUrl: string;
  readonly redactor: (value: unknown) => string;
  /** Extra named material (for example the smoke bearer) proven absent in every encoding. */
  readonly forbiddenMaterials?: readonly SensitiveMaterial[];
}

/**
 * Proves the written config files are metadata-only: exact key allowlists,
 * opaque-id-typed values, host echo only — and no bearer, sentinel, machine
 * root key material, or secret-shaped blob anywhere in the raw file text.
 */
export function assertCliConfigSurfacesMetadataOnly(
  input: CliConfigSurfaceAssertionInput,
): CliFirstValueConfigIdentity {
  const { surfaces, label } = input;
  assertEqual(surfaces.configDirFiles.join(","), PROJECT_CONFIG_FILE, `${label} project dir files`);
  for (const file of surfaces.configHomeFiles) {
    if (!CONFIG_HOME_FILE_ALLOWLIST.has(file)) {
      throw new Error(`${label} unexpected file under INSECUR_CONFIG_HOME: ${file}`);
    }
  }
  if (!surfaces.configHomeFiles.includes(USER_CONFIG_FILE)) {
    throw new Error(`${label} user config file was not written`);
  }

  const identity = assertProjectConfigMetadataOnly(surfaces.projectConfig, input.apiBaseUrl);
  assertUserConfigMetadataOnly(surfaces.userConfig, identity, input.apiBaseUrl);

  const forbiddenMaterials = [
    ...(input.forbiddenMaterials ?? []),
    ...(surfaces.machineRootKeyMaterial === undefined ? [] : [surfaces.machineRootKeyMaterial]),
  ];
  for (const [name, raw, record] of [
    [PROJECT_CONFIG_FILE, surfaces.projectConfigRaw, surfaces.projectConfig],
    [USER_CONFIG_FILE, surfaces.userConfigRaw, surfaces.userConfig],
  ] as const) {
    assertSurfaceTextMetadataOnly({
      label: `${label} ${name}`,
      text: raw,
      redactor: input.redactor,
      forbiddenMaterials,
    });
    assertJsonTreeMetadataOnly(record, `${label} ${name}`);
  }
  return identity;
}
