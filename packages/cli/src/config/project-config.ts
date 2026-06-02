import type { CliProfileId, EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import { assertNoForbiddenConfigKeys } from "./forbidden-config-keys.js";
import { projectConfigPath, readJsonFile, resolveProjectRoot, writeJsonFile } from "./paths.js";

export interface InsecurProjectConfig {
  readonly host: string;
  readonly orgId: OrganizationId;
  readonly projectId: ProjectId;
  readonly defaultEnvId: EnvironmentId;
  readonly profileId: CliProfileId;
  readonly gitBranchToEnvironment?: Readonly<Record<string, EnvironmentId>>;
}

function parseProjectConfig(record: Record<string, unknown>): InsecurProjectConfig {
  assertNoForbiddenConfigKeys(record, PROJECT_CONFIG_LABEL);
  const host = record.host;
  const orgId = record.orgId;
  const projectId = record.projectId;
  const defaultEnvId = record.defaultEnvId;
  const profileId = record.profileId;
  if (typeof host !== "string" || host === "") {
    throw new Error(`${PROJECT_CONFIG_LABEL} host must be a non-empty string`);
  }
  for (const [field, value] of [
    ["orgId", orgId],
    ["projectId", projectId],
    ["defaultEnvId", defaultEnvId],
    ["profileId", profileId],
  ] as const) {
    if (typeof value !== "string" || value === "") {
      throw new Error(`${PROJECT_CONFIG_LABEL} ${field} must be a non-empty string`);
    }
  }
  const gitBranchToEnvironment = parseGitBranchMap(record.gitBranchToEnvironment);
  return {
    host,
    orgId: orgId as OrganizationId,
    projectId: projectId as ProjectId,
    defaultEnvId: defaultEnvId as EnvironmentId,
    profileId: profileId as CliProfileId,
    ...(gitBranchToEnvironment === undefined ? {} : { gitBranchToEnvironment }),
  };
}

const PROJECT_CONFIG_LABEL = ".insecur.json";

function parseGitBranchMap(value: unknown): Readonly<Record<string, EnvironmentId>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${PROJECT_CONFIG_LABEL} gitBranchToEnvironment must be an object`);
  }
  const result: Record<string, EnvironmentId> = {};
  for (const [branch, envId] of Object.entries(value as Record<string, unknown>)) {
    if (typeof envId !== "string" || envId === "") {
      throw new Error(`${PROJECT_CONFIG_LABEL} gitBranchToEnvironment.${branch} must be a string`);
    }
    result[branch] = envId as EnvironmentId;
  }
  return result;
}

export async function loadProjectConfig(
  configDir: string | undefined,
): Promise<InsecurProjectConfig | null> {
  const root = resolveProjectRoot(configDir);
  const record = await readJsonFile(projectConfigPath(root));
  if (record === null) {
    return null;
  }
  return parseProjectConfig(record);
}

export async function writeProjectConfig(
  configDir: string | undefined,
  config: InsecurProjectConfig,
): Promise<string> {
  const root = resolveProjectRoot(configDir);
  const filePath = projectConfigPath(root);
  const payload: Record<string, unknown> = {
    host: config.host,
    orgId: config.orgId,
    projectId: config.projectId,
    defaultEnvId: config.defaultEnvId,
    profileId: config.profileId,
  };
  if (config.gitBranchToEnvironment !== undefined) {
    payload.gitBranchToEnvironment = config.gitBranchToEnvironment;
  }
  assertNoForbiddenConfigKeys(payload, PROJECT_CONFIG_LABEL);
  await writeJsonFile(filePath, payload);
  return filePath;
}
