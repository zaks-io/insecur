import { errorEnvelope, requestId } from "@insecur/domain";
import { configureKeyring, resetKeyringForTests } from "@insecur/crypto";
import { Hono } from "hono";
import { AuthFailureError } from "./auth/auth-failure-error.js";
import { createKeyringFromWorkerEnv } from "./crypto/keyring-context.js";
import { authRoutes } from "./routes/v1/auth.js";
import { onboardingRoutes } from "./routes/v1/onboarding.js";
import { runtimeInjectionRoutes } from "./routes/v1/runtime-injection.js";
import { secretsRoutes } from "./routes/v1/secrets.js";
import { sessionRoutes } from "./routes/v1/session.js";
import type { WorkerEnv } from "./env.js";

const app = new Hono<{ Bindings: WorkerEnv }>();

app.use("*", async (context, next) => {
  const shouldConfigureFromBinding = context.env.INSTANCE_ROOT_KEY !== undefined;
  if (shouldConfigureFromBinding) {
    configureKeyring(createKeyringFromWorkerEnv(context.env));
  }
  try {
    await next();
  } finally {
    if (shouldConfigureFromBinding) {
      resetKeyringForTests();
    }
  }
});

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
    service: "insecur-worker",
  }),
);

app.route("/v1/auth", authRoutes);
app.route("/v1/session", sessionRoutes);
app.route("/v1/onboarding", onboardingRoutes);
app.route("/v1/projects", secretsRoutes);
app.route("/v1/runtime-injection", runtimeInjectionRoutes);

export default app;
