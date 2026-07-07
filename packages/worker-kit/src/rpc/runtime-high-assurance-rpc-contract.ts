import type { EvaluateHighAssuranceChallengeClearInput } from "@insecur/auth";
import type {
  EnvironmentId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import type {
  HighAssuranceChallengeLifecycleState,
  HighAssuranceChallengeReviewItem,
} from "@insecur/operations";

export type { HighAssuranceChallengeLifecycleState, HighAssuranceChallengeReviewItem };

export interface ListPendingHighAssuranceChallengesRpcInput {
  readonly organizationId: OrganizationId;
  readonly actorToken: string;
  readonly requestId: RequestId;
}

export interface ListPendingHighAssuranceChallengesRpcPayload {
  readonly challenges: readonly HighAssuranceChallengeReviewItem[];
}

export interface GetHighAssuranceChallengeRpcInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly actorToken: string;
  readonly requestId: RequestId;
}

export interface GetHighAssuranceChallengeRpcPayload {
  readonly challenge: HighAssuranceChallengeReviewItem;
}

export interface ClearHighAssuranceChallengeRpcInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly sessionAssurance: EvaluateHighAssuranceChallengeClearInput;
  readonly actorToken: string;
  readonly requestId: RequestId;
}

export interface ClearHighAssuranceChallengeRpcPayload {
  readonly operationId: OperationId;
  readonly challengeId: string;
  readonly clearedAt: string;
  readonly clearingUserId: UserId;
}

export interface DenyHighAssuranceChallengeRpcInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly actorToken: string;
  readonly requestId: RequestId;
}

export interface DenyHighAssuranceChallengeRpcPayload {
  readonly operationId: OperationId;
  readonly challengeId: string;
  readonly state: "canceled";
}
