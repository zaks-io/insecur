import {
  appConnectionId,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  secretId,
  secretSyncBindingId,
  secretSyncId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import type { AppConnectionRow, SecretSyncBindingRow, SecretSyncRow } from "@insecur/tenant-store";

export const ORG = organizationId.brand("org_00000000000000000000000001");
export const PROJECT = projectId.brand("prj_00000000000000000000000001");
export const ENV = environmentId.brand("env_00000000000000000000000001");
export const CONN = appConnectionId.brand("conn_00000000000000000000000001");
export const SYNC = secretSyncId.brand("sync_00000000000000000000000001");
export const BINDING = secretSyncBindingId.brand("sbind_00000000000000000000000001");
export const SECRET = secretId.brand("sec_00000000000000000000000001");
export const USER = userId.brand("usr_00000000000000000000000001");
export const NOW = new Date("2026-01-01T00:00:00.000Z");

export function displayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

export function createGitHubConnection(
  overrides: Partial<AppConnectionRow> = {},
): AppConnectionRow {
  return {
    id: CONN,
    organizationId: ORG,
    provider: "github",
    connectionMethod: "github-app",
    displayName: displayName("github"),
    status: "active",
    setupUserId: USER,
    activeCredentialId: null,
    statusReasonCode: null,
    lastValidationCheckedAt: NOW,
    lastValidationOutcome: "success",
    lastValidationReasonCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function createActiveGitHubSync(overrides: Partial<SecretSyncRow> = {}): SecretSyncRow {
  return {
    id: SYNC,
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    appConnectionId: CONN,
    displayName: displayName("prod"),
    kind: "github-actions",
    mappingBehavior: "managed",
    autoSyncEnabled: false,
    status: "active",
    githubProviderScope: "repository",
    targetRepoId: "repo_00000000000000000000000001",
    targetGithubEnvironmentId: null,
    createdByUserId: USER,
    disabledAt: null,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function createBindingRow(
  overrides: Partial<SecretSyncBindingRow> = {},
): SecretSyncBindingRow {
  return {
    id: BINDING,
    organizationId: ORG,
    secretSyncId: SYNC,
    secretId: SECRET,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
