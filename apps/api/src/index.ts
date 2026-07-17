import { AUTH_ERROR_CODES, errorEnvelope, requestId } from "@insecur/domain";
import {
  AbuseLimitError,
  AuthConfigError,
  AuthFailureError,
  FakeWorkOSSessionConfigError,
  RuntimeTokenSigningSecretConfigError,
  domainErrorEnvelope,
} from "@insecur/worker-kit";
import { cloudflareSentryOptions } from "@insecur/observability";
import { sentry } from "@sentry/hono/cloudflare";
import { Hono } from "hono";
import { apiRequestAnalyticsMiddleware } from "./api-request-analytics.js";
import { registerApprovalRequestsRoutes } from "./routes/v1/approval-requests.js";
import { registerAuditEventsRoutes } from "./routes/v1/audit-events.js";
import { registerAuditExportRoutes } from "./routes/v1/audit-export.js";
import { registerAuthRoutes } from "./routes/v1/auth.js";
import { registerDesignPartnerFeedbackRoutes } from "./routes/v1/design-partner-feedback.js";
import { registerFirstValueUsageRoutes } from "./routes/v1/first-value-usage.js";
import { registerHighAssuranceChallengesRoutes } from "./routes/v1/high-assurance-challenges.js";
import { registerInstanceBootstrapRoutes } from "./routes/v1/instance-bootstrap.js";
import { registerInvitationsRoutes } from "./routes/v1/invitations.js";
import { registerMembersRoutes } from "./routes/v1/members.js";
import { registerOnboardingRoutes } from "./routes/v1/onboarding.js";
import { registerOperationsRoutes } from "./routes/v1/operations.js";
import { registerOrganizationsRoutes } from "./routes/v1/organizations.js";
import { registerProjectsRoutes } from "./routes/v1/projects.js";
import { registerConnectionsRoutes } from "./routes/v1/connections.js";
import { registerProtectedChangeRoutes } from "./routes/v1/protected-change.js";
import { registerRunPoliciesRoutes } from "./routes/v1/run-policies.js";
import { registerSecretSyncRoutes } from "./routes/v1/secret-syncs.js";
import { registerRuntimeInjectionRoutes } from "./routes/v1/runtime-injection.js";
import { registerSessionRoutes } from "./routes/v1/session.js";
import { registerWebhookSubscriptionsRoutes } from "./routes/v1/webhook-subscriptions.js";
import type { ApiEnv } from "./env.js";
import { logUnhandledApiError } from "./log-unhandled-error.js";

const app = new Hono<{ Bindings: ApiEnv }>();

app.use(sentry(app, cloudflareSentryOptions));

app.use(apiRequestAnalyticsMiddleware);

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
        { meta: { requestId: reqId } },
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
        { meta: { requestId: reqId } },
      ),
      503,
    );
  }
  if ("getResponse" in err && typeof err.getResponse === "function") {
    const res = err.getResponse();
    return context.newResponse(res.body, res);
  }
  logUnhandledApiError(err);
  return context.text("Internal Server Error", 500);
});

app.get("/healthz", (context) =>
  context.json({
    ok: true,
    service: "insecur-api",
    deploySha: context.env.DEPLOY_SHA,
    runId: context.env.DEPLOY_RUN_ID,
    deployedAt: context.env.DEPLOYED_AT,
  }),
);

// Tenant-scoped routes are re-homed under /v1/orgs/:organizationId (ADR-0003, tenant.isolation gate).
registerAuditEventsRoutes(app);
registerAuditExportRoutes(app);
registerAuthRoutes(app);
registerDesignPartnerFeedbackRoutes(app);
registerFirstValueUsageRoutes(app);
registerHighAssuranceChallengesRoutes(app);
registerApprovalRequestsRoutes(app);
registerInstanceBootstrapRoutes(app);
registerInvitationsRoutes(app);
registerMembersRoutes(app);
registerOnboardingRoutes(app);
registerOperationsRoutes(app);
registerOrganizationsRoutes(app);
registerProjectsRoutes(app);
registerProtectedChangeRoutes(app);
registerRunPoliciesRoutes(app);
registerSecretSyncRoutes(app);
registerConnectionsRoutes(app);
registerRuntimeInjectionRoutes(app);
registerSessionRoutes(app);
registerWebhookSubscriptionsRoutes(app);

export default app;
