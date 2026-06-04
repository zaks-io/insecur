import { type Brand, brandValue } from "./brand.js";
import {
  brandOpaqueResourceIdForPrefix,
  generateOpaqueResourceIdForPrefix,
  parseOpaqueResourceId,
  type OpaqueResourceIdPrefix,
} from "./opaque-resource-id.js";

export type OrganizationId = Brand<string, "OrganizationId">;
export type ProjectId = Brand<string, "ProjectId">;
export type EnvironmentId = Brand<string, "EnvironmentId">;
export type TeamId = Brand<string, "TeamId">;
export type MembershipId = Brand<string, "MembershipId">;
export type SecretId = Brand<string, "SecretId">;
export type SecretVersionId = Brand<string, "SecretVersionId">;
export type SharedSecretId = Brand<string, "SharedSecretId">;
export type RuntimePolicyId = Brand<string, "RuntimePolicyId">;
export type CliProfileId = Brand<string, "CliProfileId">;
export type InjectionGrantId = Brand<string, "InjectionGrantId">;
export type AuditEventId = Brand<string, "AuditEventId">;
export type OperationId = Brand<string, "OperationId">;
export type RequestId = Brand<string, "RequestId">;
export type UserId = Brand<string, "UserId">;
export type StagedChangeId = Brand<string, "StagedChangeId">;
export type InvitationId = Brand<string, "InvitationId">;
export type MachineIdentityId = Brand<string, "MachineIdentityId">;
export type AppConnectionId = Brand<string, "AppConnectionId">;
export type ProviderCredentialId = Brand<string, "ProviderCredentialId">;

type ParseBrandedIdResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "validation.invalid_opaque_resource_id" };

function createResourceIdHelpers<TBrand extends string>(
  prefix: OpaqueResourceIdPrefix,
  brandLabel: TBrand,
) {
  return {
    parse(raw: string): ParseBrandedIdResult<Brand<string, TBrand>> {
      const parsed = parseOpaqueResourceId(raw, prefix);
      if (!parsed.ok) {
        return parsed;
      }
      return {
        ok: true,
        value: brandValue<string, TBrand>(raw),
      };
    },
    brand(raw: string): Brand<string, TBrand> {
      return brandValue<string, TBrand>(brandOpaqueResourceIdForPrefix(prefix, raw));
    },
    generate(): Brand<string, TBrand> {
      const raw = generateOpaqueResourceIdForPrefix(prefix);
      return brandValue<string, TBrand>(raw);
    },
    brandLabel,
  };
}

export const organizationId = createResourceIdHelpers("org", "OrganizationId");
export const projectId = createResourceIdHelpers("prj", "ProjectId");
export const environmentId = createResourceIdHelpers("env", "EnvironmentId");
export const teamId = createResourceIdHelpers("team", "TeamId");
export const membershipId = createResourceIdHelpers("mem", "MembershipId");
export const secretId = createResourceIdHelpers("sec", "SecretId");
export const secretVersionId = createResourceIdHelpers("sv", "SecretVersionId");
export const sharedSecretId = createResourceIdHelpers("ss", "SharedSecretId");
export const runtimePolicyId = createResourceIdHelpers("rp", "RuntimePolicyId");
export const cliProfileId = createResourceIdHelpers("prof", "CliProfileId");
export const injectionGrantId = createResourceIdHelpers("igr", "InjectionGrantId");
export const auditEventId = createResourceIdHelpers("aud", "AuditEventId");
export const operationId = createResourceIdHelpers("op", "OperationId");
export const requestId = createResourceIdHelpers("req", "RequestId");
export const userId = createResourceIdHelpers("usr", "UserId");
export const stagedChangeId = createResourceIdHelpers("stg", "StagedChangeId");
export const invitationId = createResourceIdHelpers("inv", "InvitationId");
export const machineIdentityId = createResourceIdHelpers("mach", "MachineIdentityId");
export const appConnectionId = createResourceIdHelpers("conn", "AppConnectionId");
export const providerCredentialId = createResourceIdHelpers("pcred", "ProviderCredentialId");
