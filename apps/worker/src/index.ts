import { Hono } from "hono";
import { authRoutes } from "./routes/v1/auth.js";
import { onboardingRoutes } from "./routes/v1/onboarding.js";
import { runtimeInjectionRoutes } from "./routes/v1/runtime-injection.js";
import { secretsRoutes } from "./routes/v1/secrets.js";
import { sessionRoutes } from "./routes/v1/session.js";
import type { WorkerEnv } from "./env.js";

const app = new Hono<{ Bindings: WorkerEnv }>();

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
