import type { UserActorRef } from "@insecur/access";
import {
  approvalRequestId,
  secretVersionId,
  type EnvironmentId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type SecretId,
} from "@insecur/domain";
import { SECRET_VERSION_LIFECYCLE_STATES } from "@insecur/tenant-store";

export interface RequestProtectedRollbackInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretId: SecretId;
  readonly toVersionNumber: number;
  readonly promoteRequested: boolean;
  readonly comment?: string;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
}

export interface RequestProtectedRollbackResult {
  readonly approvalRequestId?: ReturnType<typeof approvalRequestId.generate>;
  readonly secretId: SecretId;
  readonly secretVersionId: ReturnType<typeof secretVersionId.generate>;
  readonly versionNumber: number;
  readonly lifecycleState:
    typeof SECRET_VERSION_LIFECYCLE_STATES.draft | typeof SECRET_VERSION_LIFECYCLE_STATES.live;
  readonly operationId?: OperationId;
}
