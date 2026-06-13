import { errorEnvelope, requestId } from "@insecur/domain";
import { AuthFailureError } from "@insecur/worker-kit";
import { Hono } from "hono";
import { authRoutes } from "./routes/v1/auth.js";
import { onboardingRoutes } from "./routes/v1/onboarding.js";
import { runtimeInjectionRoutes } from "./routes/v1/runtime-injection.js";
import { secretsRoutes } from "./routes/v1/secrets.js";
import { sessionRoutes } from "./routes/v1/session.js";
import type { ApiEnv } from "./env.js";

const app = new Hono<{ Bindings: ApiEnv }>();

app.onError((err, context) => {
  if (err instanceof AuthFailureError) {
    const reqId = requestId.generate();
    const { failure } = err;
    return context.json(
      errorEnvelope(
        {
          code: failure.code,
          message: failure.message,
          retryable: failure.retryable,
        },
        { requestId: reqId },
      ),
      401,
    );
  }
  if ("getResponse" in err && typeof err.getResponse === "function") {
    const res = err.getResponse();
    return context.newResponse(res.body, res);
  }
  console.error(err);
  return context.text("Internal Server Error", 500);
});

app.get("/healthz", (context) =>
  context.json({
    ok: true,
    service: "insecur-api",
  }),
);

app.route("/v1/auth", authRoutes);
app.route("/v1/session", sessionRoutes);
app.route("/v1/onboarding", onboardingRoutes);
// Tenant-scoped routes are re-homed under /v1/orgs/:organizationId (ADR-0003, tenant.isolation gate).
app.route("/v1/orgs/:organizationId/projects", secretsRoutes);
app.route("/v1/orgs/:organizationId/runtime-injection", runtimeInjectionRoutes);

export default app;
