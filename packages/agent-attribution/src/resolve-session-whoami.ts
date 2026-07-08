import { assertOrganizationMembership } from "@insecur/access";
import {
  type AgentSessionId,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type SessionWhoamiAttribution,
  type SessionWhoamiResolvedContext,
  type UserId,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

import { resolveAttributionTier } from "./agent-session-store.js";
import { pickWhoamiAttributionFields } from "./whoami-fields.js";

export interface ResolveSessionWhoamiInput {
  readonly userId: UserId;
  readonly sessionId: string;
  readonly sessionExpiresAt: string;
  readonly agentMarked: boolean;
  readonly derivedAgentSessionId?: AgentSessionId;
  readonly organizationId?: OrganizationId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly agentSessionId?: AgentSessionId;
  readonly agentTag?: string;
  readonly harnessName?: string;
  readonly ancestryKey?: string;
}

export interface ResolveSessionWhoamiResult {
  readonly sessionValid: true;
  readonly sessionExpiresAt: string;
  readonly resolvedContext: SessionWhoamiResolvedContext;
  readonly attribution: SessionWhoamiAttribution;
}

async function assertEnvironmentBelongsToProject(
  orgId: OrganizationId,
  projectIdValue: ProjectId,
  environmentIdValue: EnvironmentId,
): Promise<void> {
  const rows = await withTenantScope(
    { kind: "organization", organizationId: orgId },
    async ({ sql }) => {
      return await sql<{ id: string }[]>`
        SELECT id
        FROM environments
        WHERE org_id = ${orgId}
          AND project_id = ${projectIdValue}
          AND id = ${environmentIdValue}
        LIMIT 1
      `;
    },
  );
  if (rows.length === 0) {
    throw Object.assign(new Error("Environment not found in project scope."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
}

async function assertProjectInOrganization(
  orgId: OrganizationId,
  projectIdValue: ProjectId,
): Promise<void> {
  const projectRows = await withTenantScope(
    { kind: "organization", organizationId: orgId },
    async ({ sql }) => {
      return await sql<{ id: string }[]>`
        SELECT id
        FROM projects
        WHERE org_id = ${orgId}
          AND id = ${projectIdValue}
        LIMIT 1
      `;
    },
  );
  if (projectRows.length === 0) {
    throw Object.assign(new Error("Project not found in organization scope."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
}

async function resolveOrganizationContext(
  actorUserId: UserId,
  orgId: OrganizationId,
): Promise<SessionWhoamiResolvedContext> {
  await assertOrganizationMembership({ type: "user", userId: actorUserId }, orgId);
  return { organizationId: orgId };
}

async function resolveProjectContext(
  orgContext: SessionWhoamiResolvedContext,
  projectIdValue: ProjectId,
): Promise<SessionWhoamiResolvedContext> {
  const orgId = orgContext.organizationId;
  if (orgId === undefined) {
    throw Object.assign(new Error("Project requires organization context."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  await assertProjectInOrganization(orgId, projectIdValue);
  return { ...orgContext, projectId: projectIdValue };
}

async function resolveEnvironmentContext(
  projectContext: SessionWhoamiResolvedContext,
  environmentIdValue: EnvironmentId,
): Promise<SessionWhoamiResolvedContext> {
  const orgId = projectContext.organizationId;
  const projectIdValue = projectContext.projectId;
  if (orgId === undefined || projectIdValue === undefined) {
    throw Object.assign(new Error("Environment requires project context."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  await assertEnvironmentBelongsToProject(orgId, projectIdValue, environmentIdValue);
  return { ...projectContext, environmentId: environmentIdValue };
}

async function resolveContext(
  actorUserId: UserId,
  input: ResolveSessionWhoamiInput,
): Promise<SessionWhoamiResolvedContext> {
  if (input.organizationId === undefined) {
    return {};
  }

  let resolved = await resolveOrganizationContext(actorUserId, input.organizationId);
  if (input.projectId === undefined) {
    return resolved;
  }

  resolved = await resolveProjectContext(resolved, input.projectId);
  if (input.environmentId === undefined) {
    return resolved;
  }

  return resolveEnvironmentContext(resolved, input.environmentId);
}

function buildAttributionInput(input: ResolveSessionWhoamiInput) {
  return {
    humanSessionId: input.sessionId,
    userId: input.userId,
    agentMarked: input.agentMarked,
    ...(input.derivedAgentSessionId !== undefined
      ? { derivedAgentSessionId: input.derivedAgentSessionId }
      : {}),
    ...pickWhoamiAttributionFields(input),
  };
}

function toSessionWhoamiAttribution(
  attributionResult: Awaited<ReturnType<typeof resolveAttributionTier>>,
): SessionWhoamiAttribution {
  return {
    tier: attributionResult.tier,
    ...(attributionResult.agentSessionId !== undefined
      ? { agentSessionId: attributionResult.agentSessionId }
      : {}),
    ...(attributionResult.harnessName !== undefined
      ? { harnessName: attributionResult.harnessName }
      : {}),
    ...(attributionResult.tag !== undefined ? { tag: attributionResult.tag } : {}),
  };
}

export async function resolveSessionWhoami(
  input: ResolveSessionWhoamiInput,
): Promise<ResolveSessionWhoamiResult> {
  // Context membership and coordinate validation must finish before any Tier-2 write.
  const resolvedContext = await resolveContext(input.userId, input);
  const attributionResult = await resolveAttributionTier(buildAttributionInput(input));

  return {
    sessionValid: true,
    sessionExpiresAt: input.sessionExpiresAt,
    resolvedContext,
    attribution: toSessionWhoamiAttribution(attributionResult),
  };
}
