import { AUTH_ERROR_CODES } from "@insecur/domain";
import { loadUserOrganizations, type ActorRef } from "@insecur/access";
import type { ListSessionOrganizationsRpcPayload } from "@insecur/worker-kit";

export interface ListSessionOrganizationsOperationInput {
  readonly accessActor: ActorRef;
}

/**
 * Self-read for the console org switcher and default-org resolution (INS-367): the distinct
 * Organizations the verified hop-token actor holds any Membership in. No organization input and
 * no membership assertion — the actor's own user id is the entire filter, so there is nothing to
 * authorize beyond the verified token itself. Machine actors have no console session.
 */
export async function listSessionOrganizationsOperation({
  accessActor,
}: ListSessionOrganizationsOperationInput): Promise<ListSessionOrganizationsRpcPayload> {
  if (accessActor.type !== "user") {
    throw Object.assign(new Error("Missing required permission."), {
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  }

  const organizations = await loadUserOrganizations(accessActor.userId);
  return { organizations };
}
