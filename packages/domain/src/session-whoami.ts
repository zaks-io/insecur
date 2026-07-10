import type {
  AgentSessionId,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  UserId,
} from "./resource-ids.js";

export type AttributionTier = "derived" | "registered" | "tag-only" | "none";

export interface SessionWhoamiAttribution {
  readonly tier: AttributionTier;
  readonly agentSessionId?: AgentSessionId;
  readonly harnessName?: string;
  readonly tag?: string;
}

export interface SessionWhoamiResolvedContext {
  readonly organizationId?: OrganizationId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
}

export interface SessionWhoamiData {
  readonly actorType: "user";
  readonly userId: UserId;
  readonly sessionId: string;
  readonly sessionValid: boolean;
  readonly sessionExpiresAt: string;
  readonly resolvedContext: SessionWhoamiResolvedContext;
  readonly attribution: SessionWhoamiAttribution;
  readonly sessionPolicy?: {
    readonly credentialScopes?: readonly string[];
    readonly organizationId?: OrganizationId;
    readonly projectId?: ProjectId;
    readonly environmentId?: EnvironmentId;
  };
}
