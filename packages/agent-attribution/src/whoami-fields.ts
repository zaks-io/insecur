import type { AgentSessionId, EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";

export interface WhoamiOptionalFields {
  readonly derivedAgentSessionId?: AgentSessionId;
  readonly organizationId?: OrganizationId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly agentSessionId?: AgentSessionId;
  readonly agentTag?: string;
  readonly harnessName?: string;
  readonly ancestryKey?: string;
}

export function pickWhoamiContextFields(
  input: WhoamiOptionalFields,
): Pick<
  WhoamiOptionalFields,
  "derivedAgentSessionId" | "organizationId" | "projectId" | "environmentId"
> {
  return {
    ...(input.derivedAgentSessionId !== undefined
      ? { derivedAgentSessionId: input.derivedAgentSessionId }
      : {}),
    ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
  };
}

export function pickWhoamiAttributionFields(
  input: WhoamiOptionalFields,
): Pick<WhoamiOptionalFields, "agentSessionId" | "agentTag" | "harnessName" | "ancestryKey"> {
  return {
    ...(input.agentSessionId !== undefined ? { agentSessionId: input.agentSessionId } : {}),
    ...(input.agentTag !== undefined ? { agentTag: input.agentTag } : {}),
    ...(input.harnessName !== undefined ? { harnessName: input.harnessName } : {}),
    ...(input.ancestryKey !== undefined ? { ancestryKey: input.ancestryKey } : {}),
  };
}

export function pickWhoamiOptionalFields(input: WhoamiOptionalFields): WhoamiOptionalFields {
  return {
    ...pickWhoamiContextFields(input),
    ...pickWhoamiAttributionFields(input),
  };
}
