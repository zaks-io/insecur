import {
  cloudflareSentryOptions,
  sentryBrowserConfig,
  sentryFetchWithBaggageGuard,
  workerFetchWithTraceCorrelation,
} from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import serverEntry from "@tanstack/react-start/server-entry";
import type { WebEnv } from "./env.js";
import { sentryTraceNames } from "./sentry-trace-names.js";
import { buildContentSecurityPolicy, generateCspNonce } from "./security/csp.js";

const sentryServerEntry = wrapFetchWithSentry({
  fetch(request: Request, opts: Parameters<typeof serverEntry.fetch>[1]) {
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
    // Sentry instruments these bindings before they enter the server request context.
    env: WebEnv,
    _ctx: ExecutionContext,
  ): Promise<Response> {
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
    const response = await sentryServerEntry.fetch(request, {
      context: { nonce, sentry, host: new URL(request.url).host, workerEnv: env },
    });
    return withSecurityHeaders(response, nonce, {
      sentryDsn: sentry?.dsn,
      workosAuthkitOrigin: env.WORKOS_AUTHKIT_ORIGIN,
    });
  },
} satisfies ExportedHandler<WebEnv>;

handler.fetch = workerFetchWithTraceCorrelation(
  handler.fetch.bind(handler),
  () => Sentry.getActiveSpan()?.spanContext().traceId,
);

const sentryHandler = Sentry.withSentry<WebEnv, unknown, unknown, typeof handler>(
  (env) => cloudflareSentryOptions(env, sentryTraceNames),
  handler,
);

export default {
  fetch: sentryFetchWithBaggageGuard(sentryHandler, handler.fetch.bind(handler)),
} satisfies ExportedHandler<WebEnv>;
