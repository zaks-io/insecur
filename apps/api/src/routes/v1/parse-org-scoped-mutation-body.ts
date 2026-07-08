import type { UserActor } from "@insecur/auth";
import type { OrganizationId } from "@insecur/domain";
import { parseJsonBody, readOptionalString, type AuthVariables } from "@insecur/worker-kit";
import type { Context } from "hono";

import type { ApiEnv } from "../../env.js";
import { parseOrganizationRouteParam } from "./parse-org-route-params.js";

export async function parseOrgScopedMutationBody(
  context: Context<{ Bindings: ApiEnv; Variables: AuthVariables }>,
): Promise<{
  readonly userActor: UserActor;
  readonly organizationId: OrganizationId;
  readonly body: Record<string, unknown>;
  readonly operationIdRaw: string | undefined;
}> {
  const userActor = context.get("userActor");
  const organizationId = parseOrganizationRouteParam(context);
  const body = parseJsonBody(await context.req.json());
  const operationIdRaw = readOptionalString(body, "operationId");
  return { userActor, organizationId, body, operationIdRaw };
}
