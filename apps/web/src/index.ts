import {
  cloudflareSentryOptions,
  sentryBrowserConfig,
  sentryFetchWithBaggageGuard,
} from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import serverEntry from "@tanstack/react-start/server-entry";
import type { WebEnv } from "./env.js";
import { buildContentSecurityPolicy, generateCspNonce } from "./security/csp.js";

const sentryServerEntry = wrapFetchWithSentry({
  fetch(request, opts) {
    // @ts-expect-error TanStack Start's server entry type currently misses Cloudflare wrapper opts.
    return serverEntry.fetch(request, opts);
  },
});

function withSecurityHeaders(
  response: Response,
  nonce: string,
  options: {
    sentryDsn?: string | undefined;
    workosAuthkitOrigin?: string | undefined;
  } = {},
): Response {
  const headers = new Headers(response.headers);
  headers.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy(nonce, {
      sentryDsn: options.sentryDsn,
      workosAuthkitOrigin: options.workosAuthkitOrigin,
    }),
  );
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const handler = {
  async fetch(
    request: Request,
    // Cloudflare passes bindings per request; app code reads them via `cloudflare:workers`.
    env: WebEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    void ctx;

    if (new URL(request.url).pathname === "/healthz") {
      return Response.json({
        ok: true,
        service: "insecur-web",
        deploySha: env.DEPLOY_SHA,
        runId: env.DEPLOY_RUN_ID,
        deployedAt: env.DEPLOYED_AT,
      });
    }

    const nonce = generateCspNonce();
    const sentry = sentryBrowserConfig(env);
    const response = await sentryServerEntry.fetch(request, { context: { nonce, sentry } });
    return withSecurityHeaders(response, nonce, {
      sentryDsn: sentry?.dsn,
      workosAuthkitOrigin: env.WORKOS_AUTHKIT_ORIGIN,
    });
  },
} satisfies ExportedHandler<WebEnv>;

const sentryHandler = Sentry.withSentry<WebEnv>(cloudflareSentryOptions, handler);

export default {
  fetch: sentryFetchWithBaggageGuard(sentryHandler, handler.fetch.bind(handler)),
} satisfies ExportedHandler<WebEnv>;
