import { assertOrganizationMembership } from "@insecur/access";
import {
  environmentId,
  organizationId,
  projectId,
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
  const orgParsed = organizationId.parse(orgId);
  if (!orgParsed.ok) {
    throw Object.assign(new Error("Invalid organization id."), { code: orgParsed.code });
  }
  await assertOrganizationMembership({ type: "user", userId: actorUserId }, orgParsed.value);
  return { organizationId: orgParsed.value };
}

async function resolveProjectContext(
  orgContext: SessionWhoamiResolvedContext,
  projectIdValue: ProjectId,
): Promise<SessionWhoamiResolvedContext> {
  const projectParsed = projectId.parse(projectIdValue);
  if (!projectParsed.ok) {
    throw Object.assign(new Error("Invalid project id."), { code: projectParsed.code });
  }
  const orgId = orgContext.organizationId;
  if (orgId === undefined) {
    throw Object.assign(new Error("Project requires organization context."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  await assertProjectInOrganization(orgId, projectParsed.value);
  return { ...orgContext, projectId: projectParsed.value };
}

async function resolveEnvironmentContext(
  projectContext: SessionWhoamiResolvedContext,
  environmentIdValue: EnvironmentId,
): Promise<SessionWhoamiResolvedContext> {
  const environmentParsed = environmentId.parse(environmentIdValue);
  if (!environmentParsed.ok) {
    throw Object.assign(new Error("Invalid environment id."), { code: environmentParsed.code });
  }
  const orgId = projectContext.organizationId;
  const projectIdValue = projectContext.projectId;
  if (orgId === undefined || projectIdValue === undefined) {
    throw Object.assign(new Error("Environment requires project context."), {
      code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    });
  }
  await assertEnvironmentBelongsToProject(orgId, projectIdValue, environmentParsed.value);
  return { ...projectContext, environmentId: environmentParsed.value };
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
    ...(input.agentSessionId !== undefined ? { agentSessionId: input.agentSessionId } : {}),
    ...(input.agentTag !== undefined ? { agentTag: input.agentTag } : {}),
    ...(input.harnessName !== undefined ? { harnessName: input.harnessName } : {}),
    ...(input.ancestryKey !== undefined ? { ancestryKey: input.ancestryKey } : {}),
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
  const [resolvedContext, attributionResult] = await Promise.all([
    resolveContext(input.userId, input),
    resolveAttributionTier(buildAttributionInput(input)),
  ]);

  return {
    sessionValid: true,
    sessionExpiresAt: input.sessionExpiresAt,
    resolvedContext,
    attribution: toSessionWhoamiAttribution(attributionResult),
  };
}
