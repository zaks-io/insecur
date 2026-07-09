import { cloudflareSentryOptions, sentryBrowserConfig } from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import serverEntry from "@tanstack/react-start/server-entry";
import type { SiteEnv } from "./env.js";
import { withSecurityHeaders } from "./security-headers.js";
import { tryStaticSiteResponse } from "./static-site-routes.js";

const sentryServerEntry = wrapFetchWithSentry({
  fetch(request, opts) {
    // @ts-expect-error TanStack Start's server entry type currently misses Cloudflare wrapper opts.
    return serverEntry.fetch(request, opts);
  },
});

/**
 * Public Site Worker entry (ADR-0078). Serves the marketing/legal/security surface for
 * insecur.cloud. It holds no auth session, no database/keyring binding, and no API/Runtime Service
 * Binding; `env` carries no control-plane capability. A plain fetch handler (not a Hono router);
 * static pathname guards live in static-site-routes.ts for deploy-topology conformance
 * (docs/specs/deploy-route-inventory.md).
 */
const handler = {
  async fetch(request: Request, env: SiteEnv, ctx: ExecutionContext): Promise<Response> {
    void ctx;

    const { pathname } = new URL(request.url);
    const staticResponse = tryStaticSiteResponse(pathname, request.method, env);
    if (staticResponse !== null) {
      return staticResponse;
    }

    const sentry = sentryBrowserConfig(env);
    const response = await sentryServerEntry.fetch(request, { context: { sentry } });
    return withSecurityHeaders(response);
  },
} satisfies ExportedHandler<SiteEnv>;

export default Sentry.withSentry<SiteEnv>(cloudflareSentryOptions, handler);
