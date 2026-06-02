import type { AuditEventId, KnownErrorCode, OperationId, OrganizationId } from "@insecur/domain";
import type { OperationState } from "./operation-states.js";

export interface OperationWaitMetadata {
  readonly reasonCode: KnownErrorCode;
  readonly until?: string;
}

export interface OperationRetryMetadata {
  readonly attempt: number;
  readonly nextRetryAt?: string;
  readonly reasonCode?: KnownErrorCode;
}

/** Metadata-only durable progress; must never carry Sensitive Values. */
export interface OperationProgress {
  readonly auditEventIds?: readonly AuditEventId[];
  readonly wait?: OperationWaitMetadata;
  readonly retry?: OperationRetryMetadata;
  readonly counters?: Readonly<Record<string, number>>;
  readonly providerStatusCode?: KnownErrorCode;
  readonly resultCode?: KnownErrorCode;
  readonly mutationIdempotencyKey?: string;
}

export interface CreateOperationInput {
  readonly organizationId: OrganizationId;
  readonly intentCode: string;
  readonly idempotencyKey?: string;
  readonly progress?: OperationProgress;
}

export interface TransitionOperationInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly expectedState: OperationState;
  readonly nextState: OperationState;
  readonly progress?: OperationProgress;
  readonly idempotencyKey?: string;
}

export interface RecordOperationProgressInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly progress: OperationProgress;
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
}

export interface OperationPollResult {
  readonly operationId: OperationId;
  readonly organizationId: OrganizationId;
  readonly state: OperationState;
  readonly intentCode: string;
  readonly progress: OperationProgress;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OperationMutationResult {
  readonly operation: OperationPollResult;
  readonly created: boolean;
}
