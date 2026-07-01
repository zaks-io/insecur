import serverEntry from "@tanstack/react-start/server-entry";
import type { WebEnv } from "./env.js";

const contentSecurityPolicy =
  "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'";

interface TanstackServerEntry {
  fetch: (request: Request, env: WebEnv, ctx: ExecutionContext) => Response | Promise<Response>;
}

const tanstack = serverEntry as TanstackServerEntry;

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", contentSecurityPolicy);
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
  async fetch(request: Request, env: WebEnv, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname === "/healthz") {
      return Response.json({ ok: true, service: "insecur-web" });
    }
    return withSecurityHeaders(await tanstack.fetch(request, env, ctx));
  },
};
