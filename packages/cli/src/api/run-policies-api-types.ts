import type {
  DisplayName,
  EnvironmentId,
  ErrorEnvelope,
  OperationId,
  OrganizationId,
  ProjectId,
  RuntimePolicyId,
  SecretId,
  SuccessEnvelope,
} from "@insecur/domain";
import type {
  CreateRuntimeInjectionPolicyRpcPayload,
  DisableRuntimeInjectionPolicyRpcPayload,
  GetRuntimeInjectionPolicyRpcPayload,
} from "@insecur/worker-kit/rpc/runtime-run-policies-rpc-contract";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export type CreateRuntimeInjectionPolicyData = CreateRuntimeInjectionPolicyRpcPayload;
export type RuntimeInjectionPolicyShowData = GetRuntimeInjectionPolicyRpcPayload;
export type DisableRuntimeInjectionPolicyData = DisableRuntimeInjectionPolicyRpcPayload;

export interface RunPoliciesApiClient {
  createRuntimeInjectionPolicy(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
    readonly policyId: RuntimePolicyId;
    readonly displayName: DisplayName;
    readonly command: string;
    readonly commandFingerprint?: string;
    readonly secretIds: readonly SecretId[];
    readonly operationId?: OperationId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<CreateRuntimeInjectionPolicyData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  getRuntimeInjectionPolicy(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly policyId: RuntimePolicyId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<RuntimeInjectionPolicyShowData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  disableRuntimeInjectionPolicy(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
    readonly policyId: RuntimePolicyId;
    readonly comment: string;
    readonly operationId?: OperationId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<DisableRuntimeInjectionPolicyData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
