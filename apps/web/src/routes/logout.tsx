import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { logoutBrowserSession, responseWithSetCookies } from "../auth/browser-oauth.js";

export const Route = createFileRoute("/logout")({
  server: {
    handlers: {
      POST: () => {
        const request = getRequest();
        const result = logoutBrowserSession(request);
        return responseWithSetCookies(result.status, result.clearCookieHeaders);
      },
    },
  },
});
