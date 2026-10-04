import { mintEphemeralSessionCredential } from "@insecur/auth";
import type { WebEnv } from "../env.js";
import { establishBrowserSessionCookies } from "./browser-oauth-common.js";
import { normalizeReturnTo } from "./browser-oauth-pkce.js";
import { createRuntimeAdmittedUserResolver } from "../runtime/admission.js";

export interface LocalAccount {
  readonly subject: string;
  readonly displayName: string;
}

export function localLoginAccounts(env: WebEnv): readonly LocalAccount[] | null {
  // Vite removes this development flow from hosted builds; Worker variables cannot enable it.
  if (!import.meta.env.DEV) return null;
  const parsed: unknown = JSON.parse(env.LOCAL_DEV_ACCOUNTS_JSON ?? "[]");
  if (!Array.isArray(parsed) || !parsed.every(isLocalAccount)) {
    throw new Error("LOCAL_DEV_ACCOUNTS_JSON must contain local test accounts");
  }
  return parsed;
}

function isLocalAccount(value: unknown): value is LocalAccount {
  if (typeof value !== "object" || value === null) return false;
  const account = value as Record<string, unknown>;
  return (
    typeof account.subject === "string" &&
    /^user_local_[a-z0-9-]+$/.test(account.subject) &&
    typeof account.displayName === "string" &&
    account.displayName.trim().length > 0
  );
}

export async function beginLocalLogin(request: Request, env: WebEnv, form: FormData) {
  if (!import.meta.env.DEV) return null;
  if (!isSameOriginLogin(request)) return null;
  const subject = selectedLocalAccount(env, form);
  if (subject === null) return null;
  const userId = await createRuntimeAdmittedUserResolver(env)(subject);
  if (userId === null || userId === "cli_session_revoked") return null;
  requireLocalSessionSigner(env);
  const session = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId,
      workosUserId: subject,
      sessionId: `local_${crypto.randomUUID()}`,
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    redirectTo: normalizeReturnTo(new URL(request.url).searchParams.get("returnTo"), "/orgs"),
    setCookieHeaders: establishBrowserSessionCookies(session.credential),
  };
}

function isSameOriginLogin(request: Request): boolean {
  // no-referrer form submissions can send Origin: null; Fetch Metadata still binds the origin.
  const origin = request.headers.get("Origin");
  return (
    origin === new URL(request.url).origin ||
    (origin === "null" && request.headers.get("Sec-Fetch-Site") === "same-origin")
  );
}

function selectedLocalAccount(env: WebEnv, form: FormData): string | null {
  const subject = form.get("local-account");
  if (typeof subject !== "string") return null;
  return localLoginAccounts(env)?.some((account) => account.subject === subject) ? subject : null;
}

function requireLocalSessionSigner(env: WebEnv): void {
  if (!env.SESSION_SIGNING_SECRET || env.SESSION_SIGNING_SECRET.trim().length < 32) {
    throw new Error("Local login requires SESSION_SIGNING_SECRET of at least 32 characters");
  }
}
