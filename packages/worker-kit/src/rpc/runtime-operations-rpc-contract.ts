import type { InjectionGrantId, OperationId, OrganizationId, RequestId } from "@insecur/domain";

import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";

export interface RecordInjectionRunCompletedRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly grantId: InjectionGrantId;
  readonly childExitCode: number;
}

export interface RecordInjectionRunCompletedRpcPayload {
  readonly auditEventId: string;
  readonly alreadyRecorded: boolean;
}

export interface CaptureFirstValueFeedbackRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly feedbackKind: string;
  readonly noteCode: string;
  readonly grantId?: InjectionGrantId;
  readonly operationId?: OperationId;
  readonly associatedRequestId?: RequestId;
}

export interface CaptureFirstValueFeedbackRpcPayload {
  readonly feedbackId: string;
}
