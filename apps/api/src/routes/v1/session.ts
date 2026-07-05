import { successEnvelope } from "@insecur/domain";
import {
  handleRoute,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import type { ApiEnv } from "../../env.js";

export const sessionRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

sessionRoutes.get("/whoami", requireUserActor, (context) => {
  const actor = context.get("userActor");
  return context.json(
    successEnvelope({
      actorType: actor.type,
      userId: actor.userId,
      sessionId: actor.sessionId,
    }),
  );
});

// The console org-switcher memberships read (INS-367): a self-read forwarded over the private
// RUNTIME seam (ADR-0077). The public edge does zero DB I/O; the Runtime rebuilds the actor from
// the hop token and returns only that actor's own organizations.
sessionRoutes.get("/memberships", requireUserActor, async (context) =>
  handleRoute(context, async (reqId) => {
    const userActor = context.get("userActor");
    return runtimeClientFor(context.env, userActor).listSessionOrganizations({
      requestId: reqId,
    });
  }),
);
