import {
  IMPORT_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type VariableKey,
} from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import { CliError } from "../output/cli-error.js";
import {
  assertImportableEnvironment,
  buildImportWritePlans,
  buildValidatedFinalEntries,
  collectDuplicateKeys,
  loadExistingSecretKeys,
  primaryPreflightErrorCode,
} from "./import-preflight-helpers.js";
import type { ImportPreflightIssue, SecretImportPlan } from "./import-preflight-types.js";

export type { SecretImportPlan } from "./import-preflight-types.js";

export async function assertImportTargetEnvironment(input: {
  readonly api: ApiClient;
  readonly host: string;
  readonly bearerCredential: string;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}): Promise<void> {
  const environmentResult = await input.api.listEnvironments({
    host: input.host,
    bearerCredential: input.bearerCredential,
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  if (!environmentResult.ok) {
    throw new CliError(environmentResult.envelope.error);
  }

  const targetEnvironment = environmentResult.envelope.data.environments.find(
    (environment) => environment.environmentId === input.environmentId,
  );
  if (targetEnvironment === undefined) {
    throw new CliError({
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      message: "Target environment was not found in the selected project.",
      retryable: false,
    });
  }
  assertImportableEnvironment(targetEnvironment);
}

function buildPreflightFailureMessage(plan: SecretImportPlan): string {
  if (plan.existingSecretConflicts.length > 0) {
    return `Import preflight failed: ${String(plan.existingSecretConflicts.length)} existing secret conflict(s).`;
  }
  if (plan.duplicateVariableKeys.length > 0) {
    return `Import preflight failed: ${String(plan.duplicateVariableKeys.length)} duplicate final variable key(s).`;
  }
  return `Import preflight failed: ${String(plan.issues.length)} validation issue(s).`;
}

export function throwImportPreflightFailure(plan: SecretImportPlan): never {
  throw new CliError({
    code: primaryPreflightErrorCode(plan.issues),
    message: buildPreflightFailureMessage(plan),
    retryable: false,
  });
}

function appendConflictIssues(
  issues: ImportPreflightIssue[],
  existingSecretConflicts: readonly SecretImportPlan["validFinalVariableKeys"][number][],
): void {
  for (const variableKey of existingSecretConflicts) {
    issues.push({ variableKey, code: IMPORT_ERROR_CODES.existingSecret });
  }
}

function assembleSecretImportPlan(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly parsedKeyCount: number;
  readonly issues: ImportPreflightIssue[];
  readonly finalEntries: readonly {
    variableKey: VariableKey;
    lineNumber: number;
    valueUtf8: Uint8Array;
  }[];
  readonly duplicateKeys: readonly VariableKey[];
  readonly existingSecretConflicts: readonly VariableKey[];
  readonly writes: SecretImportPlan["writes"];
}): SecretImportPlan {
  const uniqueValidKeys = [
    ...new Set(
      input.finalEntries
        .map((entry) => entry.variableKey)
        .filter((key) => !input.duplicateKeys.includes(key)),
    ),
  ].sort();

  return {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    parsedKeyCount: input.parsedKeyCount,
    validFinalVariableKeys: uniqueValidKeys,
    secretShapesToCreate: [
      ...new Set(
        input.writes.filter((write) => write.createSecretShape).map((write) => write.variableKey),
      ),
    ].sort(),
    secretsToCreate: [...new Set(input.writes.map((write) => write.variableKey))].sort(),
    duplicateVariableKeys: input.duplicateKeys,
    existingSecretConflicts: input.existingSecretConflicts,
    issues: input.issues,
    writes: input.writes,
    ready:
      input.issues.length === 0 &&
      input.duplicateKeys.length === 0 &&
      input.existingSecretConflicts.length === 0,
  };
}

export async function runImportPreflight(input: {
  readonly api: ApiClient;
  readonly host: string;
  readonly bearerCredential: string;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly fileBytes: Uint8Array;
  readonly variableKeyPrefix?: string;
}): Promise<SecretImportPlan> {
  const {
    parsedKeyCount,
    issues: validationIssues,
    finalEntries,
  } = buildValidatedFinalEntries(input);
  const issues: ImportPreflightIssue[] = [...validationIssues];
  const duplicateResult = collectDuplicateKeys(finalEntries);
  issues.push(...duplicateResult.issues);

  const { existingShapeKeys, existingSecretKeys } = await loadExistingSecretKeys(input);
  const uniqueValidKeys = [
    ...new Set(
      finalEntries
        .map((entry) => entry.variableKey)
        .filter((key) => !duplicateResult.duplicates.includes(key)),
    ),
  ].sort();
  const existingSecretConflicts = uniqueValidKeys.filter((key) => existingSecretKeys.has(key));
  appendConflictIssues(issues, existingSecretConflicts);

  const writes = buildImportWritePlans({
    finalEntries,
    duplicateKeys: duplicateResult.duplicates,
    existingShapeKeys,
    existingSecretKeys,
  });

  return assembleSecretImportPlan({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    parsedKeyCount,
    issues,
    finalEntries,
    duplicateKeys: duplicateResult.duplicates,
    existingSecretConflicts,
    writes,
  });
}

export function secretImportPlanForOutput(
  plan: SecretImportPlan,
  options: { readonly dryRun: boolean },
): Record<string, unknown> {
  return {
    organizationId: plan.organizationId,
    projectId: plan.projectId,
    environmentId: plan.environmentId,
    parsedKeyCount: plan.parsedKeyCount,
    validFinalVariableKeys: plan.validFinalVariableKeys,
    secretShapesToCreate: plan.secretShapesToCreate,
    secretsToCreate: plan.secretsToCreate,
    duplicateVariableKeys: plan.duplicateVariableKeys,
    existingSecretConflicts: plan.existingSecretConflicts,
    issues: plan.issues.map((issue) => ({
      ...(issue.lineNumber === undefined ? {} : { lineNumber: issue.lineNumber }),
      ...(issue.variableKey === undefined ? {} : { variableKey: issue.variableKey }),
      code: issue.code,
    })),
    dryRun: options.dryRun,
    ready: plan.ready,
    writeCount: plan.writes.length,
  };
}
