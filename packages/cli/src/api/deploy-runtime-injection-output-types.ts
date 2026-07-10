import type {
  AuditEventId,
  EnvironmentId,
  KnownErrorCode,
  OperationId,
  ProjectId,
  RuntimePolicyId,
} from "@insecur/domain";

/**
 * CLI-side view of the metadata-only Deploy Runtime Injection output model.
 *
 * The shape mirrors `@insecur/runtime-injection`'s `DeployRuntimeInjectionOutput`
 * but is declared locally so the built CLI release entry stays self-contained and
 * never pulls a server crypto/keyring package into its bundle
 * (cli-release-boundary conformance). It is received over the API as JSON and is
 * metadata-only: no Sensitive Values, ever.
 */
type DeployRuntimeInjectionOutcome = "succeeded" | "denied" | "failed";

interface DeployRuntimeInjectionTargetData {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly isProtected: boolean;
  readonly lifecycleStage: string;
  readonly deliveryPath: string;
  readonly runtimePolicyId?: RuntimePolicyId;
}

interface DeployRuntimeInjectionGateData {
  readonly status: string;
  readonly deliveryBlocking: boolean;
  readonly checkedAt: string;
  readonly blockedControlIds: readonly string[];
}

export interface DeployRuntimeInjectionWarningData {
  readonly code: KnownErrorCode;
  readonly controlIds?: readonly string[];
}

export interface DeployRuntimeInjectionOutputData {
  readonly operationId: OperationId;
  readonly operationState: string;
  readonly outcome: DeployRuntimeInjectionOutcome;
  readonly target: DeployRuntimeInjectionTargetData;
  readonly gate?: DeployRuntimeInjectionGateData;
  readonly reasonCode?: KnownErrorCode;
  readonly warnings: readonly DeployRuntimeInjectionWarningData[];
  readonly auditEventIds: readonly AuditEventId[];
}
