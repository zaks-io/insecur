import { Hono } from "hono";
import { authRoutes } from "./routes/v1/auth.js";
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

export default app;
