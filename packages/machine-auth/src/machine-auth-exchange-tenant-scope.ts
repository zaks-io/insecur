import type {
  EnvironmentId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  RequestId,
} from "@insecur/domain";

export function machineAuthExchangeTenantScope(input: {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  machineIdentityId?: MachineIdentityId;
  request?: { requestId: RequestId };
}) {
  return {
    organizationId: input.organizationId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    ...(input.machineIdentityId !== undefined
      ? { machineIdentityId: input.machineIdentityId }
      : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
  };
}
