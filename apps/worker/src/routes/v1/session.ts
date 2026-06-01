import { successEnvelope } from "@insecur/domain";
import { Hono } from "hono";
import { requireUserActor, type AuthVariables } from "../../auth/middleware.js";
import type { WorkerEnv } from "../../env.js";

export const sessionRoutes = new Hono<{ Bindings: WorkerEnv; Variables: AuthVariables }>();

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
