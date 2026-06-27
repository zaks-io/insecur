import {
  expandBuiltInRolePresetToScopes,
  hasAuthorizationScope,
  isBuiltInRolePreset,
  resolveEffectiveAccess,
} from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { recordInvitationCreateDenied } from "./membership-management-audit.js";
import type { CreateInvitationInput } from "./invitation-types.js";
import { MembershipManagementError } from "./membership-management-error.js";

async function denyInvitationCreate(
  input: CreateInvitationInput,
  denial: {
    reasonCode: KnownErrorCode;
    message: string;
  },
): Promise<never> {
  await recordInvitationCreateDenied({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    reasonCode: denial.reasonCode,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  throw new MembershipManagementError(denial.reasonCode, denial.message, input.organizationId);
}

/**
 * Runtime-validates invitation role presets at the onboarding boundary.
 */
export async function assertInvitationRolePreset(input: CreateInvitationInput): Promise<void> {
  if (isBuiltInRolePreset(input.rolePreset)) {
    return;
  }
  await denyInvitationCreate(input, {
    reasonCode: ONBOARDING_ERROR_CODES.invitationInvalid,
    message: "invitation role preset is invalid",
  });
}

/**
 * Rejects granting a role whose scope bundle exceeds the inviter's own Effective Access. Without
 * this, an actor holding only `membership:manage` (admin) could invite at the `owner` preset and
 * confer approval/configuration scopes the inviter does not hold, escalating privilege through the
 * invitation surface. The inviter must hold every scope the requested preset would confer at the
 * invitation coordinate (a "cannot grant a role you do not hold" guard). Resolve at the same
 * coordinate `assertMembershipManageScope` uses so org- and project-scoped invitations evaluate
 * against the matching Effective Access.
 */
export async function assertInvitationRoleGrantEntitlement(
  input: CreateInvitationInput,
): Promise<void> {
  const requestedScopes = expandBuiltInRolePresetToScopes(input.rolePreset);
  const coordinate =
    input.projectId === undefined
      ? { organizationId: input.organizationId }
      : { organizationId: input.organizationId, projectId: input.projectId };
  const effectiveAccess = await resolveEffectiveAccess(input.actor, coordinate);

  const grantsScopeBeyondInviter = requestedScopes.some(
    (scope) => !hasAuthorizationScope(effectiveAccess, scope),
  );
  if (!grantsScopeBeyondInviter) {
    return;
  }
  await denyInvitationCreate(input, {
    reasonCode: AUTH_ERROR_CODES.insufficientScope,
    message: "cannot grant a role exceeding your own access",
  });
}

async function projectBelongsToOrganization(
  organizationId: OrganizationId,
  projectId: ProjectId,
): Promise<boolean> {
  const rows = await withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
    return await sql<{ id: string }[]>`
        SELECT id
        FROM projects
        WHERE org_id = ${organizationId}
          AND id = ${projectId}
        LIMIT 1
      `;
  });
  return rows.length > 0;
}

/**
 * Ensures a project-scoped invitation references a project in the same organization.
 * Missing and cross-organization project IDs share the same auth denial shape.
 */
export async function assertInvitationProjectCoordinate(
  input: CreateInvitationInput,
): Promise<void> {
  if (input.projectId === undefined) {
    return;
  }
  if (await projectBelongsToOrganization(input.organizationId, input.projectId)) {
    return;
  }
  await denyInvitationCreate(input, {
    reasonCode: AUTH_ERROR_CODES.insufficientScope,
    message: "membership management scope required",
  });
}
