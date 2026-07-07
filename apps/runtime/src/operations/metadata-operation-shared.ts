import { AUTH_ERROR_CODES, ONBOARDING_ERROR_CODES, type OrganizationId } from "@insecur/domain";
import { assertOrganizationMembership, type ActorRef } from "@insecur/access";

export function insufficientScopeError(): Error & {
  code: typeof AUTH_ERROR_CODES.insufficientScope;
} {
  return Object.assign(new Error("Missing required permission."), {
    code: AUTH_ERROR_CODES.insufficientScope,
  });
}

export function resourceConflictError(
  message: string,
): Error & { code: typeof ONBOARDING_ERROR_CODES.resourceConflict } {
  return Object.assign(new Error(message), {
    code: ONBOARDING_ERROR_CODES.resourceConflict,
  });
}

export async function assertUserOrganizationMembership(
  accessActor: ActorRef,
  organizationId: OrganizationId,
): Promise<void> {
  if (accessActor.type !== "user") {
    throw insufficientScopeError();
  }
  await assertOrganizationMembership(accessActor, organizationId);
}
