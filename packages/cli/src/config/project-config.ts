import type { CliProfileId, EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import { assertNoForbiddenConfigKeys } from "./forbidden-config-keys.js";
import { isLocalModeHost } from "./local-mode.js";
import {
  parseCliProfileId,
  parseEnvironmentId,
  parseOrganizationId,
  parseProjectId,
} from "./parse-resource-id.js";
import { requireNonEmptyString } from "./require-non-empty-string.js";
import { projectConfigPath, readJsonFile, resolveProjectRoot, writeJsonFile } from "./paths.js";
import {
  parseSecretShapeManifest,
  serializeSecretShapeManifest,
  type SecretShapeManifestEntry,
} from "./secret-shape-manifest.js";

export interface InsecurProjectConfig {
  readonly host: string;
  readonly orgId?: OrganizationId;
  readonly projectId: ProjectId;
  readonly defaultEnvId: EnvironmentId;
  readonly profileId: CliProfileId;
  readonly secretShapes?: readonly SecretShapeManifestEntry[];
  readonly gitBranchToEnvironment?: Readonly<Record<string, EnvironmentId>>;
}

function parseProjectConfig(record: Record<string, unknown>): InsecurProjectConfig {
  assertNoForbiddenConfigKeys(record, PROJECT_CONFIG_LABEL);
  const host = requireNonEmptyString(record.host, `${PROJECT_CONFIG_LABEL} host`);
  const projectIdRaw = requireNonEmptyString(record.projectId, `${PROJECT_CONFIG_LABEL} projectId`);
  const defaultEnvId = requireNonEmptyString(
    record.defaultEnvId,
    `${PROJECT_CONFIG_LABEL} defaultEnvId`,
  );
  const profileId = requireNonEmptyString(record.profileId, `${PROJECT_CONFIG_LABEL} profileId`);
  const gitBranchToEnvironment = parseGitBranchMap(record.gitBranchToEnvironment);
  const secretShapes = parseSecretShapeManifest(record.secretShapes);
  const orgId = parseOptionalOrgId(record.orgId, host);
  return {
    host,
    ...(orgId === undefined ? {} : { orgId }),
    projectId: parseProjectId(projectIdRaw, `${PROJECT_CONFIG_LABEL} projectId`),
    defaultEnvId: parseEnvironmentId(defaultEnvId, `${PROJECT_CONFIG_LABEL} defaultEnvId`),
    profileId: parseCliProfileId(profileId, `${PROJECT_CONFIG_LABEL} profileId`),
    ...(secretShapes.length === 0 ? {} : { secretShapes }),
    ...(gitBranchToEnvironment === undefined ? {} : { gitBranchToEnvironment }),
  };
}

const PROJECT_CONFIG_LABEL = ".insecur.json";

function parseOptionalOrgId(value: unknown, host: string): OrganizationId | undefined {
  if (value === undefined) {
    if (!isLocalModeHost(host)) {
      throw new Error(`${PROJECT_CONFIG_LABEL} orgId is required for hosted projects`);
    }
    return undefined;
  }
  return parseOrganizationId(
    requireNonEmptyString(value, `${PROJECT_CONFIG_LABEL} orgId`),
    `${PROJECT_CONFIG_LABEL} orgId`,
  );
}

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
    result[branch] = parseEnvironmentId(
      envId,
      `${PROJECT_CONFIG_LABEL} gitBranchToEnvironment.${branch}`,
    );
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
    projectId: config.projectId,
    defaultEnvId: config.defaultEnvId,
    profileId: config.profileId,
  };
  if (config.orgId !== undefined) {
    payload.orgId = config.orgId;
  }
  if (config.secretShapes !== undefined && config.secretShapes.length > 0) {
    payload.secretShapes = serializeSecretShapeManifest(config.secretShapes);
  }
  if (config.gitBranchToEnvironment !== undefined) {
    payload.gitBranchToEnvironment = config.gitBranchToEnvironment;
  }
  assertNoForbiddenConfigKeys(payload, PROJECT_CONFIG_LABEL);
  await writeJsonFile(filePath, payload);
  return filePath;
}
