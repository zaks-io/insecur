import type {
  DisplayName,
  EnvironmentId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  RuntimePolicyId,
  RuntimePolicyVersionId,
  SecretId,
} from "@insecur/domain";
import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";

export interface RuntimeInjectionPolicyVersionReadPayload {
  readonly policyVersionId: RuntimePolicyVersionId;
  readonly versionNumber: number;
  readonly displayNameSnapshot: DisplayName;
  readonly secretIds: readonly SecretId[];
  readonly variableKeys: readonly string[];
  readonly command: string;
  readonly commandFingerprint: string | null;
  readonly ttlSeconds: number;
  readonly deliveryMode: string;
  readonly createdAt: string;
}

export interface CreateRuntimeInjectionPolicyRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly policyId: RuntimePolicyId;
  readonly displayName: DisplayName;
  readonly command: string;
  readonly commandFingerprint?: string;
  readonly secretIds: readonly SecretId[];
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
}

export interface CreateRuntimeInjectionPolicyRpcPayload {
  readonly policyId: RuntimePolicyId;
  readonly policyVersionId: RuntimePolicyVersionId;
  readonly displayName: DisplayName;
  readonly activeVersion: RuntimeInjectionPolicyVersionReadPayload;
  readonly auditEventId: string;
}

export interface GetRuntimeInjectionPolicyRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly policyId: RuntimePolicyId;
}

export interface GetRuntimeInjectionPolicyRpcPayload {
  readonly policyId: RuntimePolicyId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly displayName: DisplayName;
  readonly disabledAt: string | null;
  readonly createdAt: string;
  readonly activeVersion: RuntimeInjectionPolicyVersionReadPayload | null;
}

export interface DisableRuntimeInjectionPolicyRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly policyId: RuntimePolicyId;
  readonly comment: string;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
}

export interface DisableRuntimeInjectionPolicyRpcPayload {
  readonly policyId: RuntimePolicyId;
  readonly disabledAt: string;
  readonly auditEventId: string;
}
