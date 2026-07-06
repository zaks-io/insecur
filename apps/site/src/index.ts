import { cloudflareSentryOptions, sentryBrowserConfig } from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import serverEntry from "@tanstack/react-start/server-entry";
import type { SiteEnv } from "./env.js";
import { INSTALL_PS1 } from "./install-ps1.js";
import {
  INSTALL_PS1_CONTENT_TYPE,
  INSTALL_SH_CONTENT_TYPE,
  installScriptResponse,
} from "./install-scripts.js";
import { INSTALL_SH } from "./install-sh.js";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Placeholder site: keep it out of search indexes until launch (belt-and-suspenders with the
  // per-page robots meta). Remove when the public site goes live.
  "X-Robots-Tag": "noindex, nofollow",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
 * the deploy-topology gate extracts the `pathname === "..."` branches below as this deploy's
 * public mounts (docs/specs/deploy-route-inventory.md).
 */
const handler = {
  async fetch(request: Request, env: SiteEnv, ctx: ExecutionContext): Promise<Response> {
    void ctx;

    const { pathname } = new URL(request.url);

    if (pathname === "/install.sh") {
      return installScriptResponse(INSTALL_SH, INSTALL_SH_CONTENT_TYPE, request.method);
    }

    if (pathname === "/install.ps1") {
      return installScriptResponse(INSTALL_PS1, INSTALL_PS1_CONTENT_TYPE, request.method);
    }

    if (pathname === "/healthz") {
      return Response.json({
        ok: true,
        service: "insecur-site",
        deploySha: env.DEPLOY_SHA ?? "unknown",
        runId: env.DEPLOY_RUN_ID ?? "unknown",
        deployedAt: env.DEPLOYED_AT ?? "unknown",
      });
    }

    const sentry = sentryBrowserConfig(env);
    const response = await sentryServerEntry.fetch(request, { context: { sentry } });
    return withSecurityHeaders(response);
  },
} satisfies ExportedHandler<SiteEnv>;

export default Sentry.withSentry<SiteEnv>(cloudflareSentryOptions, handler);
