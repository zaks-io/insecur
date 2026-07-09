import {
  INJECTION_ERROR_CODES,
  LOCAL_ERROR_CODES,
  type EnvironmentId,
  type ProjectId,
  type SecretId,
  type SecretVersionId,
  type VariableKey,
} from "@insecur/domain";
import type { LocalStore } from "@insecur/local-store";
import { CliError } from "../output/cli-error.js";

export const GRANT_ISSUED_EVENT = "runtime_injection.grant_issued";
export const GRANT_ISSUE_DENIED_EVENT = "runtime_injection.grant_issue_denied";
export const GRANT_CONSUMED_EVENT = "runtime_injection.grant_consumed";
export const GRANT_CONSUME_DENIED_EVENT = "runtime_injection.grant_consume_denied";
export const RUN_COMPLETED_EVENT = "runtime_injection.run_completed";

const INJECTION_GRANT_TTL_SECONDS = 300;

export function computeGrantExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + INJECTION_GRANT_TTL_SECONDS * 1000);
}

export function mapConsumeFailure(
  failure: "not_found" | "expired" | "already_consumed" | "binding_not_allowed" | "revoked",
): (typeof INJECTION_ERROR_CODES)[keyof typeof INJECTION_ERROR_CODES] {
  if (failure === "expired") {
    return INJECTION_ERROR_CODES.grantExpired;
  }
  return INJECTION_ERROR_CODES.grantDenied;
}

function valueMissingRemediation(variableKey: VariableKey) {
  return {
    secretsSet: ["insecur", "secrets", "set", variableKey],
  };
}

export async function resolveVariableKeyBinding(
  store: LocalStore,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  variableKey: VariableKey,
): Promise<{ secretId: SecretId; secretVersionId: SecretVersionId }> {
  const shape = await store.projects.getSecretShape(projectId, variableKey);
  if (shape === null) {
    throw new CliError({
      code: INJECTION_ERROR_CODES.grantDenied,
      message: `No secret shape exists for variable key ${variableKey}.`,
      retryable: false,
    });
  }
  const current = await store.secretVersions.getCurrentWrappedVersion(projectId, shape.secretId);
  if (current === null) {
    throw new CliError(
      {
        code: LOCAL_ERROR_CODES.valueMissingOnMachine,
        message: `Variable key ${variableKey} has no local value on this machine.`,
        retryable: false,
      },
      { remediation: valueMissingRemediation(variableKey) },
    );
  }
  const metadata = await store.secretVersions.listSecretMetadata(projectId, environmentId);
  const hasCurrent = metadata.some(
    (entry) => entry.secretId === shape.secretId && entry.hasCurrentVersion,
  );
  if (!hasCurrent) {
    throw new CliError(
      {
        code: LOCAL_ERROR_CODES.valueMissingOnMachine,
        message: `Variable key ${variableKey} has no local value on this machine.`,
        retryable: false,
      },
      { remediation: valueMissingRemediation(variableKey) },
    );
  }
  return {
    secretId: shape.secretId,
    secretVersionId: current.secretVersionId,
  };
}
