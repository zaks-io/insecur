import type {
  EnvironmentId,
  ErrorEnvelope,
  OperationId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  SuccessEnvelope,
} from "@insecur/domain";
import type {
  ListEnvironmentApprovalsRpcPayload,
  RequestProtectedPromotionRpcPayload,
  RequestProtectedRollbackRpcPayload,
} from "@insecur/worker-kit";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export type RequestProtectedPromotionData = RequestProtectedPromotionRpcPayload;
export type RequestProtectedRollbackData = RequestProtectedRollbackRpcPayload;
export type ListEnvironmentApprovalsData = ListEnvironmentApprovalsRpcPayload;

export interface ProtectedChangeApiClient {
  requestProtectedPromotion(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
    readonly draftVersionIds: readonly SecretVersionId[];
    readonly comment?: string;
    readonly impactReviewFingerprint?: string;
    readonly operationId?: OperationId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<RequestProtectedPromotionData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  requestProtectedRollback(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
    readonly secretId: SecretId;
    readonly toVersionId: SecretVersionId;
    readonly promote?: boolean;
    readonly comment?: string;
    readonly operationId?: OperationId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<RequestProtectedRollbackData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  listEnvironmentApprovals(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<ListEnvironmentApprovalsData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
