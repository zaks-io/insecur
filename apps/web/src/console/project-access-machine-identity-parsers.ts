import type {
  ConsoleEnvironmentDeployKeyMethod,
  ConsoleGitHubActionsOidcMethod,
  ConsoleMachineIdentity,
} from "./project-access-types.js";
import {
  isAuthMethodStatus,
  isRecord,
  parseOptionalNullableStringField,
  parseOptionalNumberField,
} from "./project-access-parse-helpers.js";

function parseGitHubActionsOidcScalars(
  entry: Record<string, unknown>,
): Pick<
  ConsoleGitHubActionsOidcMethod,
  "authMethodId" | "githubRepository" | "status" | "createdAt"
> | null {
  if (
    typeof entry.authMethodId !== "string" ||
    typeof entry.githubRepository !== "string" ||
    typeof entry.status !== "string" ||
    !isAuthMethodStatus(entry.status) ||
    typeof entry.createdAt !== "string"
  ) {
    return null;
  }
  return {
    authMethodId: entry.authMethodId,
    githubRepository: entry.githubRepository,
    status: entry.status,
    createdAt: entry.createdAt,
  };
}

function parseGitHubActionsOidcMethod(entry: unknown): ConsoleGitHubActionsOidcMethod | null {
  if (!isRecord(entry)) {
    return null;
  }
  const scalars = parseGitHubActionsOidcScalars(entry);
  if (scalars === null) {
    return null;
  }
  const environmentId = parseOptionalNullableStringField(entry, "environmentId");
  const githubEnvironment = parseOptionalNullableStringField(entry, "githubEnvironment");
  if (environmentId === null || githubEnvironment === null) {
    return null;
  }
  return {
    ...scalars,
    environmentId: environmentId ?? null,
    githubEnvironment: githubEnvironment ?? null,
  };
}

function parseEnvironmentDeployKeyScalars(
  entry: Record<string, unknown>,
): Pick<
  ConsoleEnvironmentDeployKeyMethod,
  "authMethodId" | "environmentId" | "status" | "nonExpiring" | "createdAt"
> | null {
  if (
    typeof entry.authMethodId !== "string" ||
    typeof entry.environmentId !== "string" ||
    typeof entry.status !== "string" ||
    !isAuthMethodStatus(entry.status) ||
    typeof entry.nonExpiring !== "boolean" ||
    typeof entry.createdAt !== "string"
  ) {
    return null;
  }
  return {
    authMethodId: entry.authMethodId,
    environmentId: entry.environmentId,
    status: entry.status,
    nonExpiring: entry.nonExpiring,
    createdAt: entry.createdAt,
  };
}

function parseDeployKeyTimingFields(entry: Record<string, unknown>) {
  const expiresAt = parseOptionalNullableStringField(entry, "expiresAt");
  const rotationIntervalSeconds = parseOptionalNumberField(entry, "rotationIntervalSeconds");
  const rotationReminderIntervalSeconds = parseOptionalNumberField(
    entry,
    "rotationReminderIntervalSeconds",
  );
  if (
    expiresAt === null ||
    rotationIntervalSeconds === null ||
    rotationReminderIntervalSeconds === null
  ) {
    return null;
  }
  return {
    expiresAt: expiresAt ?? null,
    rotationIntervalSeconds: rotationIntervalSeconds ?? null,
    rotationReminderIntervalSeconds: rotationReminderIntervalSeconds ?? null,
  };
}

function parseEnvironmentDeployKeyMethod(entry: unknown): ConsoleEnvironmentDeployKeyMethod | null {
  if (!isRecord(entry)) {
    return null;
  }
  const scalars = parseEnvironmentDeployKeyScalars(entry);
  if (scalars === null) {
    return null;
  }
  const timing = parseDeployKeyTimingFields(entry);
  if (timing === null) {
    return null;
  }
  return { ...scalars, ...timing };
}

function parseMachineIdentityScalars(
  entry: Record<string, unknown>,
): Pick<
  ConsoleMachineIdentity,
  "machineIdentityId" | "displayName" | "status" | "createdAt"
> | null {
  if (
    typeof entry.machineIdentityId !== "string" ||
    typeof entry.displayName !== "string" ||
    typeof entry.status !== "string" ||
    !isAuthMethodStatus(entry.status) ||
    typeof entry.createdAt !== "string"
  ) {
    return null;
  }
  return {
    machineIdentityId: entry.machineIdentityId,
    displayName: entry.displayName,
    status: entry.status,
    createdAt: entry.createdAt,
  };
}

function parseMachineIdentityAuthMethods(entry: Record<string, unknown>) {
  if (
    !Array.isArray(entry.githubActionsOidcMethods) ||
    !Array.isArray(entry.environmentDeployKeyMethods)
  ) {
    return null;
  }
  const githubActionsOidcMethods = entry.githubActionsOidcMethods.map(parseGitHubActionsOidcMethod);
  const environmentDeployKeyMethods = entry.environmentDeployKeyMethods.map(
    parseEnvironmentDeployKeyMethod,
  );
  if (
    !githubActionsOidcMethods.every(
      (method): method is ConsoleGitHubActionsOidcMethod => method !== null,
    ) ||
    !environmentDeployKeyMethods.every(
      (method): method is ConsoleEnvironmentDeployKeyMethod => method !== null,
    )
  ) {
    return null;
  }
  return { githubActionsOidcMethods, environmentDeployKeyMethods };
}

export function parseMachineIdentity(entry: unknown): ConsoleMachineIdentity | null {
  if (!isRecord(entry)) {
    return null;
  }
  const scalars = parseMachineIdentityScalars(entry);
  const authMethods = parseMachineIdentityAuthMethods(entry);
  if (scalars === null || authMethods === null) {
    return null;
  }
  return { ...scalars, ...authMethods };
}
