import { errorEnvelope, requestId } from "@insecur/domain";
import { Hono } from "hono";
import { AuthFailureError } from "./auth/auth-failure-error.js";
import { authRoutes } from "./routes/v1/auth.js";
import { sessionRoutes } from "./routes/v1/session.js";
import type { WorkerEnv } from "./env.js";

const app = new Hono<{ Bindings: WorkerEnv }>();

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

export default app;
