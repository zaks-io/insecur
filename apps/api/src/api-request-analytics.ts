import type { ApiEnv } from "./env.js";
import type { Context, MiddlewareHandler } from "hono";
import { routePath } from "hono/route";

const CLI_USER_AGENT =
  /^insecur-cli\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/;

export const API_REQUEST_ANALYTICS_BLOB_FIELDS = [
  "schema",
  "client_kind",
  "cli_version",
  "method",
  "route",
  "status",
  "deploy_sha",
] as const;

export const API_REQUEST_ANALYTICS_DOUBLE_FIELDS = ["count", "duration_ms"] as const;

interface ApiRequestAnalyticsInput {
  readonly env: Pick<ApiEnv, "DEPLOY_SHA"> & {
    readonly API_ANALYTICS?: AnalyticsEngineDataset;
  };
  readonly durationMs: number;
  readonly method: string;
  readonly routePath: string;
  readonly status: number;
  readonly userAgent: string | undefined;
}

function parseCliUserAgent(userAgent: string | undefined): {
  readonly clientKind: "cli" | "non_cli";
  readonly cliVersion: string;
} {
  const match = userAgent === undefined ? undefined : CLI_USER_AGENT.exec(userAgent);
  const cliVersion = match?.[1];
  return cliVersion === undefined
    ? { clientKind: "non_cli", cliVersion: "unknown" }
    : { clientKind: "cli", cliVersion };
}

/**
 * Writes only fixed request metadata. Raw paths, query strings, headers, and bodies are excluded.
 */
export function recordApiRequestAnalytics(input: ApiRequestAnalyticsInput): void {
  const analytics = input.env.API_ANALYTICS;
  if (analytics === undefined) {
    return;
  }

  const { clientKind, cliVersion } = parseCliUserAgent(input.userAgent);
  try {
    analytics.writeDataPoint({
      blobs: [
        "api_request_v1",
        clientKind,
        cliVersion,
        input.method,
        input.routePath,
        String(input.status),
        input.env.DEPLOY_SHA,
      ],
      doubles: [1, Math.max(0, Math.round(input.durationMs))],
      indexes: [`api:${clientKind}`],
    });
  } catch {
    // Analytics must never affect an API response.
  }
}

export const apiRequestAnalyticsMiddleware: MiddlewareHandler<{ Bindings: ApiEnv }> = async (
  context,
  next,
) => {
  const startedAt = performance.now();
  try {
    await next();
  } finally {
    // Hono's route helper ignores the application's Env generic and reads router state only.
    const resolvedRoutePath = routePath(context as Context, -1) || "/*";
    recordApiRequestAnalytics({
      env: context.env,
      durationMs: performance.now() - startedAt,
      method: context.req.method,
      routePath: resolvedRoutePath,
      status: context.res.status,
      userAgent: context.req.header("user-agent"),
    });
  }
};
