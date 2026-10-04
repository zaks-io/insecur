import {
  INSECUR_CSRF_COOKIE,
  WORKOS_SESSION_COOKIE,
  mintEphemeralSessionCredential,
} from "@insecur/auth";
import { userId } from "@insecur/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeRuntimeAdmissionBinding,
  createFakeWebEnv,
} from "../../test/support/fake-web-env.js";
import { ssrRequest, SSR_TEST_ORIGIN } from "../../test/support/ssr-request.js";
import { beginLocalLogin, localLoginAccounts } from "./local-login.js";
import { resolveBrowserActor } from "./resolve-browser-actor.js";
import { logoutBrowserSession } from "./browser-oauth.js";

vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("./workos-port.js", () => ({
  createWorkOSSessionPortFromEnv: () => {
    throw new Error("WorkOS must not be called");
  },
}));
const alice = { subject: "user_local_alice", displayName: "Alice" };
const bob = { subject: "user_local_bob", displayName: "Bob" };
const aliceId = userId.generate();
const bobId = userId.generate();

function localEnv() {
  return createFakeWebEnv({
    WORKOS_API_KEY: "",
    WORKOS_COOKIE_PASSWORD: "",
    WORKOS_CLIENT_ID: "",
    LOCAL_DEV_ACCOUNTS_JSON: JSON.stringify([alice, bob]),
    RUNTIME: createFakeRuntimeAdmissionBinding({ [alice.subject]: aliceId, [bob.subject]: bobId })
      .runtime,
  });
}
function loginForm(subject = alice.subject) {
  const form = new FormData();
  form.set("local-account", subject);
  return form;
}
function loginRequest(origin = SSR_TEST_ORIGIN, path = "/login") {
  return ssrRequest(path, { method: "POST", headers: { Origin: origin } });
}
function cookieHeader(cookies: readonly string[]) {
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

describe("local development accounts", () => {
  beforeEach(() => vi.stubEnv("DEV", true));
  afterEach(() => vi.unstubAllEnvs());

  it("signs in two distinct admitted accounts without WorkOS configuration", async () => {
    const env = localEnv();
    for (const [account, expectedId] of [
      [alice, aliceId],
      [bob, bobId],
    ] as const) {
      const result = await beginLocalLogin(loginRequest(), env, loginForm(account.subject));
      expect(result?.redirectTo).toBe("/orgs");
      if (result === null) throw new Error("Local login failed");
      const resolved = await resolveBrowserActor(
        ssrRequest("/orgs", { headers: { Cookie: cookieHeader(result.setCookieHeaders) } }),
        env,
      );
      expect(resolved).toMatchObject({
        ok: true,
        actor: { userId: expectedId, workosUserId: account.subject },
      });
      expect(result.setCookieHeaders[0]).toContain("HttpOnly");
      expect(result.setCookieHeaders[0]).toContain("Secure");
    }
  });

  it("requires same-origin login, a configured account, and active admission", async () => {
    const env = localEnv();
    for (const site of ["cross-site", "same-origin"]) {
      const request = ssrRequest("/login", {
        method: "POST",
        headers: { Origin: "null", "Sec-Fetch-Site": site },
      });
      expect(await beginLocalLogin(request, env, loginForm())).toEqual(
        site === "same-origin" ? expect.objectContaining({ redirectTo: "/orgs" }) : null,
      );
    }
    expect(
      await beginLocalLogin(loginRequest("https://attacker.test"), env, loginForm()),
    ).toBeNull();
    expect(await beginLocalLogin(loginRequest(), env, loginForm("user_local_unknown"))).toBeNull();
    expect(
      await beginLocalLogin(
        loginRequest(),
        { ...env, RUNTIME: createFakeRuntimeAdmissionBinding().runtime },
        loginForm(),
      ),
    ).toBeNull();
  });

  it("rejects tampered, expired, duplicate, revoked and mismatched sessions", async () => {
    const env = localEnv();
    const actor = {
      type: "user" as const,
      userId: aliceId,
      workosUserId: alice.subject,
      sessionId: "local_test",
    };
    const mint = (ttlSeconds?: number) =>
      mintEphemeralSessionCredential({
        actor,
        signingSecret: env.SESSION_SIGNING_SECRET,
        ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
      });
    const valid = (await mint()).credential;
    for (const cookie of [valid + "bad", (await mint(0)).credential]) {
      expect(
        (await resolveBrowserActor(ssrRequest("/orgs", { sessionCookie: cookie }), env)).ok,
      ).toBe(false);
    }
    expect(
      (
        await resolveBrowserActor(
          ssrRequest("/orgs", {
            headers: {
              Cookie: `${WORKOS_SESSION_COOKIE}=${valid}; ${WORKOS_SESSION_COOKIE}=${valid}`,
            },
          }),
          env,
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await resolveBrowserActor(ssrRequest("/orgs", { sessionCookie: valid }), {
          ...env,
          RUNTIME: createFakeRuntimeAdmissionBinding({ [alice.subject]: bobId }).runtime,
        })
      ).ok,
    ).toBe(false);
    const revoked = {
      ...env.RUNTIME,
      resolveAdmission: () =>
        Promise.resolve({ ok: true as const, value: { userId: aliceId, cliSessionRevoked: true } }),
    };
    expect(
      (
        await resolveBrowserActor(ssrRequest("/orgs", { sessionCookie: valid }), {
          ...env,
          RUNTIME: revoked,
        })
      ).ok,
    ).toBe(false);
  });

  it("keeps logout CSRF protection and clears cookies without a provider call", async () => {
    const env = localEnv();
    const result = await beginLocalLogin(loginRequest(), env, loginForm());
    if (result === null) throw new Error("Local login failed");
    const cookie = cookieHeader(result.setCookieHeaders);
    const csrf = result.setCookieHeaders[1]?.split(";")[0]?.slice(INSECUR_CSRF_COOKIE.length + 1);
    if (!csrf) throw new Error("Local login omitted CSRF cookie");
    expect(
      await logoutBrowserSession(
        ssrRequest("/logout", { method: "POST", headers: { Cookie: cookie } }),
        env,
      ),
    ).toEqual({ ok: false, status: 403 });
    expect(
      await logoutBrowserSession(
        ssrRequest("/logout", {
          method: "POST",
          headers: { Cookie: cookie, "x-insecur-csrf": csrf },
        }),
        env,
      ),
    ).toMatchObject({
      ok: true,
      redirectTo: "/login",
      clearCookieHeaders: expect.arrayContaining([expect.stringContaining("Max-Age=0")]),
    });
  });

  it("normalizes return URLs and fails loudly on malformed local configuration", async () => {
    expect(
      (
        await beginLocalLogin(
          loginRequest(SSR_TEST_ORIGIN, "/login?returnTo=https://attacker.test"),
          localEnv(),
          loginForm(),
        )
      )?.redirectTo,
    ).toBe("/orgs");
    expect(() =>
      localLoginAccounts({
        ...localEnv(),
        LOCAL_DEV_ACCOUNTS_JSON: JSON.stringify([{ subject: "user_real", displayName: "Real" }]),
      }),
    ).toThrow();
    await expect(
      beginLocalLogin(
        loginRequest(),
        { ...localEnv(), SESSION_SIGNING_SECRET: "short" },
        loginForm(),
      ),
    ).rejects.toThrow("SESSION_SIGNING_SECRET");
  });

  it("cannot enable local login in production with Worker variables", async () => {
    vi.stubEnv("DEV", false);
    const env = localEnv();
    expect(localLoginAccounts(env)).toBeNull();
    expect(await beginLocalLogin(loginRequest(), env, loginForm())).toBeNull();
    const token = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: aliceId,
        workosUserId: alice.subject,
        sessionId: "local_test",
      },
      signingSecret: env.SESSION_SIGNING_SECRET,
    });
    await expect(
      resolveBrowserActor(ssrRequest("/orgs", { sessionCookie: token.credential }), env),
    ).rejects.toThrow("WorkOS must not be called");
  });
});
