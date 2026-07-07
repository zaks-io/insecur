import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { beginBrowserPasskeyEnrollment } from "../auth/browser-passkey-enrollment.js";
import { formatPkceStateClearCookie } from "../auth/browser-oauth-pkce.js";
import { redirectResponse } from "../auth/browser-oauth.js";
import { loginFailureRedirectPath } from "../auth/login-error.js";
import type { WebEnv } from "../env.js";

export const Route = createFileRoute("/auth/enroll-passkey")({
  server: {
    handlers: {
      GET: async () => {
        const request = getRequest();
        const webEnv = env as WebEnv;
        const started = await beginBrowserPasskeyEnrollment(request, webEnv);
        if ("ok" in started) {
          return redirectResponse(loginFailureRedirectPath(started.failure.reason), [
            formatPkceStateClearCookie(),
          ]);
        }
        return redirectResponse(started.authorizationUrl, started.setCookieHeaders, 303);
      },
    },
  },
});
