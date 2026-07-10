import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@insecur/ui";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { useCallback, useRef, useState } from "react";
import { beginBrowserLogin, redirectResponse } from "../auth/browser-oauth.js";
import {
  loginErrorMessage,
  parseLoginErrorCode,
  type LoginErrorCode,
} from "../auth/login-error.js";
import {
  readTurnstileToken,
  turnstileSiteKey,
  verifyTurnstileToken,
  TURNSTILE_RESPONSE_FIELD,
} from "../auth/turnstile.js";
import { LoginPrivacyNotice } from "../components/login-privacy-notice.js";
import { SiteFrame } from "../components/site-frame.js";
import { TurnstileWidget } from "../components/turnstile-widget.js";
import { asWebEnv } from "../env.js";

interface LoginChallenge {
  readonly siteKey: string;
  readonly errorCode: LoginErrorCode | null;
}

type LoginVerificationState = "checking" | "challenging" | "redirecting" | "failed";

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

  return (
    <SiteFrame>
      <section className="px-5 py-10 sm:px-8 sm:py-12">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Continue to the tenant console.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm siteKey={siteKey} errorCode={errorCode} />
          </CardContent>
        </Card>
      </section>
    </SiteFrame>
  );
}

function LoginForm({ siteKey, errorCode }: LoginChallenge) {
  const login = useAutoLoginForm();

  return (
    <form ref={login.formRef} method="post" className="flex flex-col gap-5">
      {errorCode !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {loginErrorMessage(errorCode)}
        </p>
      ) : null}
      <input
        ref={login.tokenInputRef}
        type="hidden"
        name={TURNSTILE_RESPONSE_FIELD}
        defaultValue=""
      />
      <TurnstileWidget
        siteKey={siteKey}
        onFailure={login.handleTurnstileFailure}
        onInteractiveChange={login.handleInteractiveChange}
        onTokenChange={login.handleTurnstileToken}
      />
      <LoginVerificationStatus state={login.verificationState} />
      <LoginPrivacyNotice />
      {login.verificationState === "failed" ? (
        <Button type="button" variant="outline" onClick={reloadPage}>
          Retry
        </Button>
      ) : null}
      <noscript>
        <p className="text-sm text-destructive" role="alert">
          JavaScript is required to verify this sign-in attempt.
        </p>
      </noscript>
    </form>
  );
}

function useAutoLoginForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const submittedRef = useRef(false);
  const [verificationState, setVerificationState] = useState<LoginVerificationState>("checking");
  const handleTurnstileToken = useCallback((token: string) => {
    if (tokenInputRef.current) {
      tokenInputRef.current.value = token;
    }
    if (token.length === 0 || submittedRef.current) {
      return;
    }

    const form = formRef.current;
    if (!form) {
      setVerificationState("failed");
      return;
    }

    submittedRef.current = true;
    setVerificationState("redirecting");
    submitLoginForm(form);
  }, []);
  const handleInteractiveChange = useCallback((interactive: boolean) => {
    if (!submittedRef.current) {
      setVerificationState(interactive ? "challenging" : "checking");
    }
  }, []);
  const handleTurnstileFailure = useCallback(() => {
    submittedRef.current = false;
    setVerificationState("failed");
  }, []);

  return {
    formRef,
    handleInteractiveChange,
    handleTurnstileFailure,
    handleTurnstileToken,
    tokenInputRef,
    verificationState,
  };
}

function submitLoginForm(form: HTMLFormElement): void {
  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }
  form.submit();
}

function reloadPage(): void {
  window.location.reload();
}

function LoginVerificationStatus({ state }: { readonly state: LoginVerificationState }) {
  return (
    <p
      className={state === "failed" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      role={state === "failed" ? "alert" : "status"}
    >
      {loginVerificationMessage(state)}
    </p>
  );
}

function loginVerificationMessage(state: LoginVerificationState): string {
  switch (state) {
    case "checking":
      return "Checking your browser...";
    case "challenging":
      return "Complete the check to continue.";
    case "redirecting":
      return "Opening sign-in...";
    case "failed":
      return "Verification could not start. Refresh and try again.";
  }
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
