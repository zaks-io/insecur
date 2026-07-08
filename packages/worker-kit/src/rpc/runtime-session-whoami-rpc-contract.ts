import type {
  AgentSessionId,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SessionWhoamiAttribution,
  SessionWhoamiResolvedContext,
} from "@insecur/domain";

import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";

export interface ResolveSessionWhoamiRpcInput extends PostAuthRpcInputBase {
  readonly organizationId?: OrganizationId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly agentSessionId?: AgentSessionId;
  readonly agentTag?: string;
  readonly harnessName?: string;
  readonly ancestryKey?: string;
  readonly derivedAgentSessionId?: AgentSessionId;
  readonly sessionExpiresAt: string;
  readonly agentMarked: boolean;
}

export interface ResolveSessionWhoamiRpcPayload {
  readonly sessionValid: true;
  readonly sessionExpiresAt: string;
  readonly resolvedContext: SessionWhoamiResolvedContext;
  readonly attribution: SessionWhoamiAttribution;
}

export interface RegisterAgentSessionRpcInput extends PostAuthRpcInputBase {
  readonly harnessName: string;
  readonly ancestryKey: string;
}

export interface RegisterAgentSessionRpcPayload {
  readonly agentSessionId: AgentSessionId;
  readonly harnessName: string;
}
