import type {
  DisplayName,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  RuntimePolicyId,
  RuntimePolicyVersionId,
  SecretId,
  VariableKey,
} from "@insecur/domain";

export const RUNTIME_INJECTION_DELIVERY_MODES = {
  environmentVariables: "environment_variables",
} as const;

export type RuntimeInjectionDeliveryMode =
  (typeof RUNTIME_INJECTION_DELIVERY_MODES)[keyof typeof RUNTIME_INJECTION_DELIVERY_MODES];

export interface RuntimeInjectionPolicyBindingInput {
  secretIds: readonly SecretId[];
  variableKeys: readonly VariableKey[];
}

export interface RuntimeInjectionPolicyVersionContentInput {
  command: string;
  commandFingerprint?: string;
  ttlSeconds: number;
  deliveryMode: RuntimeInjectionDeliveryMode;
  bindings: RuntimeInjectionPolicyBindingInput;
}

export interface CreateRuntimeInjectionPolicyInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  policyId: RuntimePolicyId;
  policyVersionId: RuntimePolicyVersionId;
  displayName: DisplayName;
  version: RuntimeInjectionPolicyVersionContentInput;
}

export interface PublishRuntimeInjectionPolicyVersionInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  policyId: RuntimePolicyId;
  policyVersionId: RuntimePolicyVersionId;
  displayName: DisplayName;
  version: RuntimeInjectionPolicyVersionContentInput;
}

export interface RuntimeInjectionPolicyRow {
  policyId: RuntimePolicyId;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  displayName: DisplayName;
  activeVersionId: RuntimePolicyVersionId | null;
  disabledAt: Date | null;
  createdAt: Date;
}

export interface RuntimeInjectionPolicyVersionRow {
  policyVersionId: RuntimePolicyVersionId;
  policyId: RuntimePolicyId;
  organizationId: OrganizationId;
  versionNumber: number;
  displayNameSnapshot: DisplayName;
  secretIds: readonly SecretId[];
  variableKeys: readonly VariableKey[];
  command: string;
  commandFingerprint: string | null;
  ttlSeconds: number;
  deliveryMode: RuntimeInjectionDeliveryMode;
  createdAt: Date;
}
