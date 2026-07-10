import type { EnvironmentId, OrganizationId, ProjectId, UserId } from "@insecur/domain";

/**
 * Resolved human actor for First Value routes. Authorization uses Effective Access,
 * not Role names on this object.
 */
export interface UserActor {
  readonly type: "user";
  readonly userId: UserId;
  /** Stable WorkOS user identifier (External Subject). */
  readonly workosUserId: string;
  /** Opaque insecur session row identifier for audit correlation. */
  readonly sessionId: string;
  /** Optional derived-agent hard bounds. Effective Access intersects with these claims. */
  readonly credentialScopes?: readonly string[];
  readonly tokenScope?: {
    readonly organizationId?: OrganizationId;
    readonly projectId?: ProjectId;
    readonly environmentId?: EnvironmentId;
  };
}
