import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@insecur/ui";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { useCallback, useState } from "react";
import { beginBrowserLogin, redirectResponse } from "../auth/browser-oauth.js";
import {
  loginErrorMessage,
  parseLoginErrorCode,
  type LoginErrorCode,
} from "../auth/login-error.js";
import { readTurnstileToken, turnstileSiteKey, verifyTurnstileToken } from "../auth/turnstile.js";
import { SiteFrame } from "../components/site-frame.js";
import { TurnstileWidget } from "../components/turnstile-widget.js";
import { asWebEnv } from "../env.js";

interface LoginChallenge {
  readonly siteKey: string;
  readonly errorCode: LoginErrorCode | null;
}

const loadLoginChallenge = createServerFn({ method: "GET" }).handler((): LoginChallenge => {
  const request = getRequest();
  const url = new URL(request.url);
  return {
    siteKey: turnstileSiteKey(asWebEnv(env)),
    errorCode: parseLoginErrorCode(url.searchParams.get("error")),
  };
});

export const Route = createFileRoute("/login")({
  server: {
    handlers: {
      POST: async () => {
        const request = getRequest();
        const webEnv = asWebEnv(env);
        const formData = await request.formData();
        const verified = await verifyTurnstileToken(request, webEnv, readTurnstileToken(formData));
        if (!verified.ok) {
          return redirectResponse(loginRetryUrl(request), [], 303);
        }

        const started = await beginBrowserLogin(request, webEnv);
        return redirectResponse(started.authorizationUrl, started.setCookieHeaders, 303);
      },
    },
  },
  loader: async () => loadLoginChallenge(),
  component: LoginPage,
});

function LoginPage() {
  const { siteKey, errorCode } = Route.useLoaderData();
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  return (
    <SiteFrame>
      <section className="px-5 py-10 sm:px-8 sm:py-12">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Continue to the tenant console.</CardDescription>
          </CardHeader>
          <CardContent>
            <form method="post" className="flex flex-col gap-5">
              {errorCode !== null ? (
                <p className="text-sm text-destructive" role="alert">
                  {loginErrorMessage(errorCode)}
                </p>
              ) : null}
              <TurnstileWidget siteKey={siteKey} onTokenChange={handleTurnstileToken} />
              <Button type="submit" disabled={turnstileToken.length === 0}>
                Continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </SiteFrame>
  );
}

function loginRetryUrl(request: Request): string {
  const url = new URL(request.url);
  const retry = new URL("/login", url.origin);
  const returnTo = url.searchParams.get("returnTo");
  if (returnTo !== null) {
    retry.searchParams.set("returnTo", returnTo);
  }
  retry.searchParams.set("error", "verification");
  return `${retry.pathname}${retry.search}`;
}
