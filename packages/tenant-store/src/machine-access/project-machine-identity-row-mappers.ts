import { environmentId, machineIdentityId } from "@insecur/domain";

import type {
  EnvironmentDeployKeyAuthMethodRow,
  GitHubActionsOidcAuthMethodRow,
} from "./project-machine-identity-types.js";

function parseAuthMethodStatus(value: string): "active" | "disabled" | null {
  return value === "active" || value === "disabled" ? value : null;
}

function parseOptionalEnvironmentId(value: string | null) {
  if (value === null) {
    return { ok: true as const, value: null };
  }
  return environmentId.parse(value);
}

export function toGitHubActionsOidcRow(row: {
  readonly id: string;
  readonly machineIdentityId: string;
  readonly environmentId: string | null;
  readonly githubRepository: string;
  readonly githubEnvironment: string | null;
  readonly status: string;
  readonly createdAt: Date;
}): GitHubActionsOidcAuthMethodRow | null {
  const status = parseAuthMethodStatus(row.status);
  const parsedMachineIdentityId = machineIdentityId.parse(row.machineIdentityId);
  const parsedEnvironmentId = parseOptionalEnvironmentId(row.environmentId);
  if (!status || !parsedMachineIdentityId.ok || !parsedEnvironmentId.ok) {
    return null;
  }
  return {
    authMethodId: row.id,
    machineIdentityId: parsedMachineIdentityId.value,
    environmentId: parsedEnvironmentId.value,
    githubRepository: row.githubRepository,
    githubEnvironment: row.githubEnvironment,
    status,
    createdAt: row.createdAt,
  };
}

export function toEnvironmentDeployKeyRow(row: {
  readonly id: string;
  readonly machineIdentityId: string;
  readonly environmentId: string;
  readonly status: string;
  readonly nonExpiring: boolean;
  readonly expiresAt: Date | null;
  readonly rotationIntervalSeconds: number | null;
  readonly rotationReminderIntervalSeconds: number | null;
  readonly createdAt: Date;
}): EnvironmentDeployKeyAuthMethodRow | null {
  const status = parseAuthMethodStatus(row.status);
  const parsedMachineIdentityId = machineIdentityId.parse(row.machineIdentityId);
  const parsedEnvironmentId = environmentId.parse(row.environmentId);
  if (!status || !parsedMachineIdentityId.ok || !parsedEnvironmentId.ok) {
    return null;
  }
  return {
    authMethodId: row.id,
    machineIdentityId: parsedMachineIdentityId.value,
    environmentId: parsedEnvironmentId.value,
    status,
    nonExpiring: row.nonExpiring,
    expiresAt: row.expiresAt,
    rotationIntervalSeconds: row.rotationIntervalSeconds,
    rotationReminderIntervalSeconds: row.rotationReminderIntervalSeconds,
    createdAt: row.createdAt,
  };
}
