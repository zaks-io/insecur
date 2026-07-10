import type { AgentSessionId, EnvironmentId, OrganizationId, ProjectId } from "./resource-ids.js";

export interface DeriveAgentSessionData {
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly agentSessionId: AgentSessionId;
  readonly credentialScopes?: readonly string[];
  readonly organizationId?: OrganizationId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly ttlSeconds?: number;
}

export interface RegisterAgentSessionData {
  readonly agentSessionId: AgentSessionId;
  readonly harnessName: string;
}
