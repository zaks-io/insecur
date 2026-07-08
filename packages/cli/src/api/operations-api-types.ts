import type { OperationId, OrganizationId } from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export interface OperationPollData {
  readonly operationId: OperationId;
  readonly organizationId: OrganizationId;
  readonly state: string;
  readonly intentCode: string;
  readonly progress: Record<string, unknown>;
  readonly executionDeadline?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OperationCancelData extends OperationPollData {
  readonly auditEventId: string;
}

export interface OperationsApiClient {
  getOperation(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly operationId: OperationId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<OperationPollData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  cancelOperation(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly operationId: OperationId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<OperationCancelData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
