import { Hono } from "hono";

const app = new Hono();

app.get("/healthz", (context) =>
  context.json({
    ok: true,
    service: "insecur-worker",
  }),
);

export default app;
