import type { EnvironmentId, MachineIdentityId, UserId } from "@insecur/domain";

export interface HighAssuranceEvidenceScopeFields {
  readonly environmentId?: EnvironmentId;
  readonly requestingUserId?: UserId;
  readonly requestingMachineIdentityId?: MachineIdentityId;
}

export function optionalHighAssuranceEvidenceScopeFields(
  evidence: HighAssuranceEvidenceScopeFields,
): Partial<HighAssuranceEvidenceScopeFields> {
  return {
    ...(evidence.environmentId !== undefined ? { environmentId: evidence.environmentId } : {}),
    ...(evidence.requestingUserId !== undefined
      ? { requestingUserId: evidence.requestingUserId }
      : {}),
    ...(evidence.requestingMachineIdentityId !== undefined
      ? { requestingMachineIdentityId: evidence.requestingMachineIdentityId }
      : {}),
  };
}
