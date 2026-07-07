import type {
  AuditEventId,
  EnvironmentId,
  KnownErrorCode,
  MachineIdentityId,
  OperationId,
  OrganizationId,
  ProjectId,
  UserId,
} from "@insecur/domain";
import type { OperationState } from "./operation-states.js";
import type { OperationSyncTargetLeaseProgress } from "./sync-target-lease-operation-progress.js";
import type { FencingToken, SyncTargetKey, SyncTargetLeaseContext } from "./sync-target-types.js";

export interface OperationWaitMetadata {
  readonly reasonCode: KnownErrorCode;
  readonly until?: string;
}

/** Operation-bound High-Assurance Challenge evidence (metadata-only, no Sensitive Values). */
export interface OperationHighAssuranceChallengeEvidence {
  readonly challengeId: string;
  readonly riskReasonCode: string;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly requestingUserId?: UserId;
  readonly requestingMachineIdentityId?: MachineIdentityId;
  readonly requestedAt: string;
  readonly expiresAt: string;
  readonly requestAuditEventId: AuditEventId;
  readonly clearedAt?: string;
  readonly clearingUserId?: UserId;
  readonly clearAuthenticationMethodCode?: string;
  readonly clearAuditEventId?: AuditEventId;
  readonly consumedAt?: string;
  readonly consumeAuditEventId?: AuditEventId;
  readonly denyingUserId?: UserId;
  readonly denyAuditEventId?: AuditEventId;
}

export type HighAssuranceChallengeLifecycleState =
  "not_required" | "required" | "pending" | "cleared" | "expired" | "consumed";

/** Metadata-only review row for Human Approval Surface inbox/detail reads. */
export interface HighAssuranceChallengeReviewItem {
  readonly operationId: OperationId;
  readonly intentCode: string;
  readonly challengeId: string;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly riskReasonCode: string;
  readonly requestedAt: string;
  readonly expiresAt: string;
  readonly requestingUserId?: UserId;
  readonly requestingMachineIdentityId?: MachineIdentityId;
  readonly status: HighAssuranceChallengeLifecycleState;
  readonly hasClearedEvidence: boolean;
}

export interface OperationRetryMetadata {
  readonly attempt: number;
  readonly nextRetryAt?: string;
  readonly reasonCode?: KnownErrorCode;
}

export type OperationIncompleteCause = "retryable" | "action_required";

/** Caller-writable metadata-only progress; must never carry Sensitive Values. */
export interface OperationProgressInput {
  readonly auditEventIds?: readonly AuditEventId[];
  readonly wait?: OperationWaitMetadata;
  readonly retry?: OperationRetryMetadata;
  readonly counters?: Readonly<Record<string, number>>;
  readonly providerStatusCode?: KnownErrorCode;
  readonly resultCode?: KnownErrorCode;
  readonly mutationIdempotencyKey?: string;
  readonly cause?: OperationIncompleteCause;
  readonly highAssuranceChallenge?: OperationHighAssuranceChallengeEvidence;
}

/** Stored operation progress, including lease binding owned by claim/release APIs. */
export interface OperationProgress extends OperationProgressInput {
  readonly syncTargetLease?: OperationSyncTargetLeaseProgress;
  /** Set by abandonment parking when a dead executor's claim expires (ADR-0073). */
  readonly abandoned?: boolean;
}

/** Internal patch shape; `syncTargetLease: null` clears the binding. */
export type OperationProgressPatch = OperationProgressInput & {
  readonly syncTargetLease?: OperationSyncTargetLeaseProgress | null;
  readonly abandoned?: boolean;
};

export interface CreateOperationInput {
  readonly organizationId: OrganizationId;
  readonly intentCode: string;
  readonly idempotencyKey?: string;
  readonly progress?: OperationProgressInput;
}

export interface TransitionOperationInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly nextState: OperationState;
  readonly progress?: OperationProgressInput;
  readonly idempotencyKey?: string;
  /** Required after a sync target lease is acquired for guarded mutable transitions. */
  readonly lease?: SyncTargetLeaseContext;
}

export interface RecordOperationProgressInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly progress: OperationProgressInput;
  /** Required after a sync target lease is acquired for guarded progress updates during sync. */
  readonly lease?: SyncTargetLeaseContext;
}

export interface GetOperationInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
}

export interface RetryOperationInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly idempotencyKey?: string;
}

export interface CancelOperationInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  /**
   * When set, CAS UPDATE also requires uncleared, unconsumed high-assurance challenge
   * evidence with the given challenge id (prevents deny-after-clear races).
   */
  readonly highAssuranceDenyCas?: {
    readonly challengeId: string;
  };
  /** Metadata-only progress persisted atomically with cancel (e.g. deny audit linkage). */
  readonly progress?: OperationProgressInput;
}

export interface OperationPollResult {
  readonly operationId: OperationId;
  readonly organizationId: OrganizationId;
  readonly state: OperationState;
  readonly intentCode: string;
  readonly progress: OperationProgress;
  readonly executionDeadline?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OperationMutationResult {
  readonly operation: OperationPollResult;
  readonly created: boolean;
}

export interface ClaimSyncTargetLeaseInput {
  readonly target: SyncTargetKey;
  readonly operationId: OperationId;
  readonly ttlSeconds: number;
}

export interface RenewSyncTargetLeaseInput {
  readonly target: SyncTargetKey;
  readonly operationId: OperationId;
  readonly fencingToken: FencingToken;
  readonly ttlSeconds: number;
}

export interface ReleaseSyncTargetLeaseInput {
  readonly target: SyncTargetKey;
  readonly operationId: OperationId;
  readonly fencingToken: FencingToken;
}

export interface AssertSyncTargetLeaseInput {
  readonly target: SyncTargetKey;
  readonly operationId: OperationId;
  readonly fencingToken: FencingToken;
}

export interface SyncTargetLeaseClaimResult {
  readonly target: SyncTargetKey;
  readonly fencingToken: FencingToken;
}
