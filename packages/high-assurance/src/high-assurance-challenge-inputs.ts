import type { AuthorizationScope } from "@insecur/access";
import type { EffectiveAccessResult } from "@insecur/access";
import type { EvaluateSessionAssuranceInput } from "@insecur/auth";
import type {
  EnvironmentId,
  MachineIdentityId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";

export interface ClearHighAssuranceChallengeInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly operationId: OperationId;
  readonly clearingUserId: UserId;
  readonly sessionAssurance: EvaluateSessionAssuranceInput;
  readonly requiredScopes?: readonly AuthorizationScope[];
  readonly clearingUserAccess?: EffectiveAccessResult;
  readonly request?: { requestId: RequestId };
}

export interface ConsumeHighAssuranceEvidenceInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly clearingUserId: UserId;
  readonly requiredScopes?: readonly AuthorizationScope[];
  readonly clearingUserAccess?: EffectiveAccessResult;
  readonly idempotencyKey?: string;
  readonly request?: { requestId: RequestId };
}

export interface RequestHighAssuranceChallengeInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly operationId: OperationId;
  readonly riskReasonCode: string;
  readonly requestingUserId?: UserId;
  readonly requestingMachineIdentityId?: MachineIdentityId;
  readonly ttlSeconds?: number;
  readonly request?: { requestId: RequestId };
}

export interface GetHighAssuranceChallengeStatusInput {
  readonly organizationId: OrganizationId;
  readonly operationId: OperationId;
  readonly now?: string;
}
