import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import {
  logoutBrowserSession,
  redirectResponse,
  responseWithSetCookies,
} from "../auth/browser-oauth.js";
import { asWebEnv } from "../env.js";

export const Route = createFileRoute("/logout")({
  server: {
    handlers: {
      POST: async () => {
        const request = getRequest();
        const result = await logoutBrowserSession(request, asWebEnv(env));
        if (!result.ok) {
          return responseWithSetCookies(result.status, []);
        }
        // 303 turns the form POST into a GET: either the WorkOS logout URL (terminating the
        // provider session) or /login for a local-only logout. Both hops satisfy the CSP
        // form-action allowlist (self + WORKOS_AUTHKIT_ORIGIN).
        return redirectResponse(result.redirectTo, result.clearCookieHeaders, 303);
      },
    },
  },
});
