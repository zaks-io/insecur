import serverEntry from "@tanstack/react-start/server-entry";
import type { WebEnv } from "./env.js";
import { buildContentSecurityPolicy, generateCspNonce } from "./security/csp.js";

function withSecurityHeaders(response: Response, nonce: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(
    request: Request,
    // Cloudflare passes bindings per request; app code reads them via `cloudflare:workers`.
    env: WebEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    void env;
    void ctx;

    if (new URL(request.url).pathname === "/healthz") {
      return Response.json({ ok: true, service: "insecur-web" });
    }

    const nonce = generateCspNonce();
    const response = await serverEntry.fetch(request, { context: { nonce } });
    return withSecurityHeaders(response, nonce);
  },
};
