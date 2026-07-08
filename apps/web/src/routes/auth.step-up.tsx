import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { beginBrowserChallengeClearStepUp } from "../auth/browser-challenge-clear-step-up.js";
import { formatPkceStateClearCookie } from "../auth/browser-oauth-pkce.js";
import { redirectResponse } from "../auth/browser-oauth.js";
import { loginFailureRedirectPath } from "../auth/login-error.js";
import { asWebEnv } from "../env.js";

export const Route = createFileRoute("/auth/step-up")({
  server: {
    handlers: {
      GET: async () => {
        const request = getRequest();
        const webEnv = asWebEnv(env);
        const started = await beginBrowserChallengeClearStepUp(request, webEnv);
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
