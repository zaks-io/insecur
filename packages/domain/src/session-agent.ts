import type { AgentSessionId } from "./resource-ids.js";

export interface DeriveAgentSessionData {
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly agentSessionId: AgentSessionId;
}

export interface RegisterAgentSessionData {
  readonly agentSessionId: AgentSessionId;
  readonly harnessName: string;
}
