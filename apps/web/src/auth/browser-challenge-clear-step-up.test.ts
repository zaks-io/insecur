import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createFakeRuntimeAdmissionBinding,
  createFakeWebEnv,
} from "../../test/support/fake-web-env.js";
import {
  beginBrowserChallengeClearStepUp,
  challengeClearStepUpHref,
  completeBrowserChallengeClearStepUp,
  resolveStepUpFailureRedirect,
  stepUpFailureRedirectPath,
  stepUpSuccessRedirectPath,
} from "./browser-challenge-clear-step-up.js";
import { INSECUR_OAUTH_PKCE_COOKIE } from "./browser-oauth-pkce.js";
import { WORKOS_SESSION_COOKIE } from "@insecur/auth";
import { FAKE_ADMITTED_USER_ID } from "../../test/support/fake-browser-session.js";

function fakeWebEnv() {
  const { runtime } = createFakeRuntimeAdmissionBinding({
    [sessionLiterals.workosUserId]: FAKE_ADMITTED_USER_ID,
  });
  return createFakeWebEnv({ RUNTIME: runtime });
}

const pkceLiterals = vi.hoisted(() => ({
  stepUpCode: "code_challenge_clear",
  codeVerifier: "verifier_challenge_clear",
}));
const oauthState = "state_challenge_clear";
const ORG_ID = "org_01JZ8E2QYQAAAAAAAAAAAAAAAA";
const OPERATION_ID = "op_01JZ8E2QYQAAAAAAAAAAAAAAAA";
const PROJECT_ID = "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA";
const RETURN_TO = `/orgs/${ORG_ID}/approvals/${OPERATION_ID}`;

const sessionLiterals = vi.hoisted(() => ({
  sealedSession: "sealed-session-fake",
  sessionId: "session_web_fake",
  workosUserId: "user_01workos",
}));

vi.mock("./workos-port.js", async () => {
  const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
  const { fakeSessionEntry } = await import("../../test/support/fake-browser-session.js");
  const createDefaultPort = () =>
    createFakeWorkOSSessionPort([
      fakeSessionEntry({
        sessionData: sessionLiterals.sealedSession,
        sessionId: sessionLiterals.sessionId,
        userId: sessionLiterals.workosUserId,
        email: "member@example.com",
        authenticationMethod: "Password",
        authFactors: [{ type: "totp" }],
      }),
      fakeSessionEntry({
        sessionData: "sealed-step-up-exchange",
        sessionId: sessionLiterals.sessionId,
        userId: sessionLiterals.workosUserId,
        authorizationCode: pkceLiterals.stepUpCode,
        codeVerifier: pkceLiterals.codeVerifier,
        authenticationMethod: "Password",
        authFactors: [{ type: "totp" }],
      }),
      fakeSessionEntry({
        sessionData: "sealed-no-factor-exchange",
        sessionId: sessionLiterals.sessionId,
        userId: sessionLiterals.workosUserId,
        authorizationCode: "code_no_factor",
        codeVerifier: "verifier_no_factor",
        authenticationMethod: "Password",
        authFactors: [],
      }),
    ]);
  return {
    createWorkOSSessionPortFromEnv: vi.fn(createDefaultPort),
  };
});

vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: () => undefined,
}));

vi.mock("@insecur/worker-kit/api-client", async () => {
  const actual = await vi.importActual<typeof import("@insecur/worker-kit/api-client")>(
    "@insecur/worker-kit/api-client",
  );
  return {
    ...actual,
    apiClientFor: vi.fn(() => ({
      clearOrgHighAssuranceChallenge: vi.fn(async () => ({
        ok: true,
        data: {
          operationId: OPERATION_ID,
          challengeId: "challenge-001",
          clearedAt: "2026-07-08T00:00:00.000Z",
        },
      })),
    })),
  };
});

function encodePkceCookie(roundTrip: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(roundTrip), "utf8").toString("base64url");
}

describe("challengeClearStepUpHref", () => {
  it("binds the pending operation in the step-up start URL", () => {
    expect(
      challengeClearStepUpHref({
        returnTo: RETURN_TO,
        organizationId: ORG_ID,
        operationId: OPERATION_ID,
        projectId: PROJECT_ID,
      }),
    ).toBe(
      `/auth/step-up?returnTo=${encodeURIComponent(RETURN_TO)}&organizationId=${ORG_ID}&operationId=${OPERATION_ID}&projectId=${PROJECT_ID}`,
    );
  });
});

describe("beginBrowserChallengeClearStepUp", () => {
  it("redirects to WorkOS with challenge-clear PKCE state for a signed-in member", async () => {
    const request = new Request(
      `https://insecur.test/auth/step-up?returnTo=${encodeURIComponent(RETURN_TO)}&organizationId=${ORG_ID}&operationId=${OPERATION_ID}&projectId=${PROJECT_ID}`,
      {
        headers: {
          Cookie: `${WORKOS_SESSION_COOKIE}=${sessionLiterals.sealedSession}`,
        },
      },
    );

    const started = await beginBrowserChallengeClearStepUp(request, fakeWebEnv());

    expect("authorizationUrl" in started).toBe(true);
    if ("authorizationUrl" in started) {
      const url = new URL(started.authorizationUrl);
      expect(url.searchParams.get("max_age")).toBe("0");
      expect(started.setCookieHeaders[0]).toContain(INSECUR_OAUTH_PKCE_COOKIE);
    }
  });

  it("rejects unauthenticated step-up starts", async () => {
    const request = new Request(
      `https://insecur.test/auth/step-up?returnTo=${encodeURIComponent(RETURN_TO)}&organizationId=${ORG_ID}&operationId=${OPERATION_ID}&projectId=${PROJECT_ID}`,
    );
    const started = await beginBrowserChallengeClearStepUp(request, fakeWebEnv());
    expect(started).toEqual({ ok: false, failure: expect.objectContaining({ reason: "missing" }) });
  });
});

describe("completeBrowserChallengeClearStepUp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exchanges step-up and clears the bound challenge", async () => {
    const roundTrip = {
      state: oauthState,
      codeVerifier: pkceLiterals.codeVerifier,
      returnTo: RETURN_TO,
      workosUserId: sessionLiterals.workosUserId,
      flow: "challenge-clear" as const,
      challengeClear: {
        organizationId: ORG_ID,
        operationId: OPERATION_ID,
        projectId: PROJECT_ID,
      },
    };
    const request = new Request(
      `https://insecur.test/auth/step-up/callback?code=${pkceLiterals.stepUpCode}&state=${oauthState}`,
      {
        headers: {
          Cookie: [
            `${INSECUR_OAUTH_PKCE_COOKIE}=${encodePkceCookie(roundTrip)}`,
            `${WORKOS_SESSION_COOKIE}=${sessionLiterals.sealedSession}`,
          ].join("; "),
        },
      },
    );

    const completed = await completeBrowserChallengeClearStepUp(request, fakeWebEnv());

    expect(completed.ok).toBe(true);
    if (completed.ok) {
      expect(completed.value.redirectTo).toContain("approved=1");
      expect(completed.value.redirectTo).toContain(encodeURIComponent(OPERATION_ID));
    }
  });

  it("rejects step-up without an eligible enrolled factor", async () => {
    const roundTrip = {
      state: oauthState,
      codeVerifier: "verifier_no_factor",
      returnTo: RETURN_TO,
      workosUserId: sessionLiterals.workosUserId,
      flow: "challenge-clear" as const,
      challengeClear: {
        organizationId: ORG_ID,
        operationId: OPERATION_ID,
        projectId: PROJECT_ID,
      },
    };
    const request = new Request(
      `https://insecur.test/auth/step-up/callback?code=code_no_factor&state=${oauthState}`,
      {
        headers: {
          Cookie: [
            `${INSECUR_OAUTH_PKCE_COOKIE}=${encodePkceCookie(roundTrip)}`,
            `${WORKOS_SESSION_COOKIE}=${sessionLiterals.sealedSession}`,
          ].join("; "),
        },
      },
    );

    const completed = await completeBrowserChallengeClearStepUp(request, fakeWebEnv());

    expect(completed.ok).toBe(false);
    if (!completed.ok) {
      expect(completed.redirectTo).toContain("approve=failed");
      expect(completed.redirectTo).toContain("approveReason=unenrolled");
    }
  });
});

describe("step-up redirect helpers", () => {
  it("names approval success on the return path", () => {
    expect(
      stepUpSuccessRedirectPath(RETURN_TO, {
        ok: true,
        operationId: OPERATION_ID,
        challengeId: "challenge-001",
        clearedAt: "2026-07-08T00:00:00.000Z",
      }),
    ).toContain("approved=1");
  });

  it("names approval failure on the return path", () => {
    expect(
      stepUpFailureRedirectPath(RETURN_TO, "clear", "high_assurance.session_assurance_failed"),
    ).toContain("approveCode=high_assurance.session_assurance_failed");
  });

  it("falls back when the PKCE round-trip is missing", () => {
    const request = new Request("https://insecur.test/auth/step-up/callback");
    expect(resolveStepUpFailureRedirect(request)).toBe("/orgs?approve=failed&approveReason=factor");
  });
});
