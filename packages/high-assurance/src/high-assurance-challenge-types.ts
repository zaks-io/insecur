import type { EnvironmentId, OperationId, ProjectId, UserId } from "@insecur/domain";

export type HighAssuranceChallengeLifecycleState =
  "not_required" | "required" | "pending" | "cleared" | "expired" | "consumed";

/** Metadata-only challenge status for approval policy and polling surfaces. */
export interface HighAssuranceChallengeStatus {
  readonly state: HighAssuranceChallengeLifecycleState;
  readonly operationId: OperationId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly riskReasonCode?: string;
  readonly expiresAt?: string;
  readonly clearedAt?: string;
  readonly clearingUserId?: UserId;
  readonly consumedAt?: string;
  readonly hasClearedEvidence: boolean;
}
