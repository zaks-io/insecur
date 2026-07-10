import {
  assertMetadataSafe,
  isMetadataSafeStringValue,
  type AuditEventId,
  type EnvironmentId,
  type KnownErrorCode,
  type OperationId,
  type ProjectId,
  type RuntimePolicyId,
} from "@insecur/domain";
import type { OperationState } from "@insecur/operations";
import type {
  StorageGateDeliveryPath,
  StorageGateVerdictStatus,
} from "@insecur/storage-security-gate";

/**
 * Metadata-only output model for the Deploy Runtime Injection path.
 *
 * This is a reporting shape only: it references an Operation ID, resolved target
 * metadata, a status, warnings, and audit event IDs. It never carries Sensitive
 * Values, Sensitive Metadata, decrypted material, or a reveal/export path. The
 * builder runs {@link assertMetadataSafe} on every produced model so a Sensitive
 * Value cannot leak into CLI/API output, logs, telemetry, or fixtures.
 */

export type DeployRuntimeInjectionOutcome = "succeeded" | "denied" | "failed";

/** Resolved, non-secret target identity for the deploy runtime injection operation. */
export interface DeployRuntimeInjectionTarget {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly isProtected: boolean;
  readonly lifecycleStage: string;
  readonly deliveryPath: StorageGateDeliveryPath;
  readonly runtimePolicyId?: RuntimePolicyId;
}

/** Metadata-only Storage Security Gate summary attached to a deploy output. */
export interface DeployRuntimeInjectionGateSummary {
  readonly status: StorageGateVerdictStatus;
  readonly deliveryBlocking: boolean;
  readonly checkedAt: string;
  readonly blockedControlIds: readonly string[];
}

/**
 * A metadata-only warning on an otherwise-successful deploy output. `code` is a
 * stable dotted code and `controlIds` reference gate controls, never prose that
 * could smuggle a Sensitive Value.
 */
export interface DeployRuntimeInjectionWarning {
  readonly code: KnownErrorCode;
  readonly controlIds?: readonly string[];
}

export interface DeployRuntimeInjectionOutput {
  readonly operationId: OperationId;
  readonly operationState: OperationState;
  readonly outcome: DeployRuntimeInjectionOutcome;
  readonly target: DeployRuntimeInjectionTarget;
  readonly gate?: DeployRuntimeInjectionGateSummary;
  /** Present for denied/failed outcomes; the stable code that fail-closed the path. */
  readonly reasonCode?: KnownErrorCode;
  readonly warnings: readonly DeployRuntimeInjectionWarning[];
  readonly auditEventIds: readonly AuditEventId[];
}

const OUTCOME_BY_TERMINAL_STATE: Partial<Record<OperationState, DeployRuntimeInjectionOutcome>> = {
  succeeded: "succeeded",
  completed_with_warnings: "succeeded",
  blocked: "denied",
  canceled: "denied",
  failed: "failed",
  incomplete: "failed",
};

function outcomeForState(
  state: OperationState,
  reasonCode: KnownErrorCode | undefined,
): DeployRuntimeInjectionOutcome {
  const mapped = OUTCOME_BY_TERMINAL_STATE[state];
  if (mapped !== undefined) {
    return mapped;
  }
  // Non-terminal states with a fail-closed reason report as denied, otherwise failed.
  return reasonCode === undefined ? "failed" : "denied";
}

/**
 * Structurally rejects any control ID that is not a stable dotted code or opaque
 * ID, so Sensitive Values cannot be smuggled into output as free-form prose. This
 * is stronger than the pattern-based {@link assertMetadataSafe} sweep.
 */
function assertControlIdsMetadataSafe(controlIds: readonly string[], label: string): void {
  for (const controlId of controlIds) {
    if (!isMetadataSafeStringValue(controlId)) {
      throw new Error(
        `deploy runtime injection ${label} control id is not metadata-safe: it must be a stable dotted code or opaque id`,
      );
    }
  }
}

export interface BuildDeployRuntimeInjectionOutputInput {
  readonly operationId: OperationId;
  readonly operationState: OperationState;
  readonly target: DeployRuntimeInjectionTarget;
  readonly gate?: DeployRuntimeInjectionGateSummary;
  readonly reasonCode?: KnownErrorCode;
  readonly warnings?: readonly DeployRuntimeInjectionWarning[];
  readonly auditEventIds?: readonly AuditEventId[];
}

/**
 * Builds the metadata-only Deploy Runtime Injection output model and asserts it
 * carries no Sensitive Value. Covers success, denied-gate, and failed shapes:
 * the `outcome` is derived from the Operation Store state (INS-66) and the
 * fail-closed gate decision (INS-65) rather than invented locally.
 */
function assertOutputControlIdsMetadataSafe(input: BuildDeployRuntimeInjectionOutputInput): void {
  if (input.gate !== undefined) {
    assertControlIdsMetadataSafe(input.gate.blockedControlIds, "gate");
  }
  for (const warning of input.warnings ?? []) {
    if (warning.controlIds !== undefined) {
      assertControlIdsMetadataSafe(warning.controlIds, "warning");
    }
  }
}

export function buildDeployRuntimeInjectionOutput(
  input: BuildDeployRuntimeInjectionOutputInput,
): DeployRuntimeInjectionOutput {
  assertOutputControlIdsMetadataSafe(input);
  const optional: Pick<DeployRuntimeInjectionOutput, "gate" | "reasonCode"> = {
    ...(input.gate !== undefined ? { gate: input.gate } : {}),
    ...(input.reasonCode !== undefined ? { reasonCode: input.reasonCode } : {}),
  };
  const output: DeployRuntimeInjectionOutput = {
    operationId: input.operationId,
    operationState: input.operationState,
    outcome: outcomeForState(input.operationState, input.reasonCode),
    target: input.target,
    ...optional,
    warnings: input.warnings ?? [],
    auditEventIds: input.auditEventIds ?? [],
  };
  assertMetadataSafe(output);
  return output;
}

/**
 * Derives a metadata-only output model directly from a resolved gate context.
 * Convenience over {@link buildDeployRuntimeInjectionOutput} for callers that
 * already hold a Storage Security Gate verdict from the production gate (INS-65).
 */
export interface DeployRuntimeInjectionGateContextLike {
  readonly deliveryPath: StorageGateDeliveryPath;
  readonly environment: { readonly isProtected: boolean; readonly lifecycleStage: string };
  readonly gateVerdict?: {
    readonly status: StorageGateVerdictStatus;
    readonly delivery_blocking: boolean;
    readonly checked_at: string;
    readonly error?: KnownErrorCode;
    readonly controls: readonly { readonly id: string; readonly status: string }[];
  };
}

function gateSummaryFromVerdict(
  verdict: NonNullable<DeployRuntimeInjectionGateContextLike["gateVerdict"]>,
): DeployRuntimeInjectionGateSummary {
  return {
    status: verdict.status,
    deliveryBlocking: verdict.delivery_blocking,
    checkedAt: verdict.checked_at,
    blockedControlIds: verdict.controls
      .filter((control) => control.status === "blocked" || control.status === "unknown")
      .map((control) => control.id),
  };
}

export interface BuildDeployRuntimeInjectionOutputFromGateContextInput {
  readonly operationId: OperationId;
  readonly operationState: OperationState;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly context: DeployRuntimeInjectionGateContextLike;
  readonly runtimePolicyId?: RuntimePolicyId;
  readonly reasonCode?: KnownErrorCode;
  readonly warnings?: readonly DeployRuntimeInjectionWarning[];
  readonly auditEventIds?: readonly AuditEventId[];
}

function targetFromGateContext(
  input: BuildDeployRuntimeInjectionOutputFromGateContextInput,
): DeployRuntimeInjectionTarget {
  return {
    projectId: input.projectId,
    environmentId: input.environmentId,
    isProtected: input.context.environment.isProtected,
    lifecycleStage: input.context.environment.lifecycleStage,
    deliveryPath: input.context.deliveryPath,
    ...(input.runtimePolicyId !== undefined ? { runtimePolicyId: input.runtimePolicyId } : {}),
  };
}

function optionalFieldsFromGateContext(
  input: BuildDeployRuntimeInjectionOutputFromGateContextInput,
): Pick<
  BuildDeployRuntimeInjectionOutputInput,
  "gate" | "reasonCode" | "warnings" | "auditEventIds"
> {
  const verdict = input.context.gateVerdict;
  const resolvedReasonCode = input.reasonCode ?? verdict?.error;
  return {
    ...(verdict !== undefined ? { gate: gateSummaryFromVerdict(verdict) } : {}),
    ...(resolvedReasonCode !== undefined ? { reasonCode: resolvedReasonCode } : {}),
    ...(input.warnings !== undefined ? { warnings: input.warnings } : {}),
    ...(input.auditEventIds !== undefined ? { auditEventIds: input.auditEventIds } : {}),
  };
}

export function buildDeployRuntimeInjectionOutputFromGateContext(
  input: BuildDeployRuntimeInjectionOutputFromGateContextInput,
): DeployRuntimeInjectionOutput {
  return buildDeployRuntimeInjectionOutput({
    operationId: input.operationId,
    operationState: input.operationState,
    target: targetFromGateContext(input),
    ...optionalFieldsFromGateContext(input),
  });
}
