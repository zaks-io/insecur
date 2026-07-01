import { AUTH_ERROR_CODES, errorEnvelope, requestId } from "@insecur/domain";
import {
  AbuseLimitError,
  AuthConfigError,
  AuthFailureError,
  FakeWorkOSSessionConfigError,
  RuntimeTokenSigningSecretConfigError,
  domainErrorEnvelope,
} from "@insecur/worker-kit";
import { Hono } from "hono";
import { authRoutes } from "./routes/v1/auth.js";
import { instanceBootstrapRoutes } from "./routes/v1/instance-bootstrap.js";
import { invitationsRoutes } from "./routes/v1/invitations.js";
import { onboardingRoutes } from "./routes/v1/onboarding.js";
import { operationsRoutes } from "./routes/v1/operations.js";
import { organizationsRoutes } from "./routes/v1/organizations.js";
import { runtimeInjectionRoutes } from "./routes/v1/runtime-injection.js";
import { secretsRoutes } from "./routes/v1/secrets.js";
import { sessionRoutes } from "./routes/v1/session.js";
import type { ApiEnv } from "./env.js";

const app = new Hono<{ Bindings: ApiEnv }>();

app.onError((err, context) => {
  if (err instanceof AbuseLimitError) {
    const { status, body } = domainErrorEnvelope(err, requestId.generate());
    return context.json(body, status as 429);
  }
  if (err instanceof AuthFailureError) {
    const { failure, requestId: reqId } = err;
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
  if (
    err instanceof AuthConfigError ||
    err instanceof FakeWorkOSSessionConfigError ||
    err instanceof RuntimeTokenSigningSecretConfigError
  ) {
    const reqId = requestId.generate();
    return context.json(
      errorEnvelope(
        {
          code: AUTH_ERROR_CODES.configInvalid,
          message: err.message,
          retryable: false,
        },
        { requestId: reqId },
      ),
      503,
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
app.route("/v1/instance/bootstrap", instanceBootstrapRoutes);
// Tenant-scoped routes are re-homed under /v1/orgs/:organizationId (ADR-0003, tenant.isolation gate).
app.route("/v1/orgs/:organizationId/invitations", invitationsRoutes);
app.route("/v1/orgs/:organizationId/organizations", organizationsRoutes);
app.route("/v1/orgs/:organizationId/projects", secretsRoutes);
app.route("/v1/orgs/:organizationId/operations", operationsRoutes);
app.route("/v1/orgs/:organizationId/runtime-injection", runtimeInjectionRoutes);

export default app;
