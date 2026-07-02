import { WORKOS_SESSION_COOKIE } from "@insecur/auth";
import { createFakeWorkOSSessionPort, testSessionSigningSecret } from "@insecur/auth/testing";
import { requestId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebEnv } from "../env.js";
import type { RuntimeAdmissionRpc } from "../runtime/admission-types.js";
import { hasWorkosSessionCookie, resolveBrowserActor } from "./resolve-browser-actor.js";

const instanceId = "inst_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
const workosUserId = "user_01workos";
const sealedSession = "sealed-session-admitted-test";

function createTestRuntime(admissions: Readonly<Record<string, ReturnType<typeof userId.brand>>>) {
  const admitted = new Map(Object.entries(admissions));
  const deniedCalls: {
    instanceId: string;
    workosUserId: string;
    requestId: ReturnType<typeof requestId.brand>;
  }[] = [];
  const runtime: RuntimeAdmissionRpc = {
    resolveAdmission: (input) =>
      Promise.resolve({
        ok: true,
        value: { userId: admitted.get(input.workosUserId) ?? null },
      }),
    recordAdmissionDenied: (input) => {
      deniedCalls.push(input);
      return Promise.resolve({ ok: true, value: { recorded: true } });
    },
  };
  return { runtime, deniedCalls };
}

function createTestEnv(runtime: RuntimeAdmissionRpc): WebEnv {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    INSTANCE_ID: instanceId,
    API: { fetch: () => Promise.reject(new Error("API binding not used")) } as unknown as Fetcher,
    RUNTIME: runtime,
  };
}

vi.mock("./workos-port.js", () => ({
  createWorkOSSessionPortFromEnv: () =>
    createFakeWorkOSSessionPort([
      {
        sessionData: sealedSession,
        userId: workosUserId,
        sessionId: "session_web",
        authFactors: [{ type: "totp" }],
      },
    ]),
}));

function sessionRequest(): Request {
  return new Request("https://insecur.test/whoami", {
    headers: {
      Cookie: `${WORKOS_SESSION_COOKIE}=${sealedSession}`,
    },
  });
}

describe("hasWorkosSessionCookie", () => {
  it("detects the WorkOS sealed session cookie", () => {
    const request = new Request("https://insecur.test/whoami", {
      headers: { Cookie: "wos-session=sealed; insecur_csrf=abc" },
    });
    expect(hasWorkosSessionCookie(request)).toBe(true);
  });

  it("returns false when the session cookie is absent", () => {
    const request = new Request("https://insecur.test/whoami");
    expect(hasWorkosSessionCookie(request)).toBe(false);
  });
});

describe("resolveBrowserActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards denied-admission audit metadata over the Runtime binding", async () => {
    const { runtime, deniedCalls } = createTestRuntime({});
    const result = await resolveBrowserActor(sessionRequest(), createTestEnv(runtime));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("not_admitted");
      expect(result.failure.admissionDenial?.workosUserId).toBe(workosUserId);
    }
    expect(deniedCalls).toHaveLength(1);
    expect(deniedCalls[0]?.instanceId).toBe(instanceId);
    expect(deniedCalls[0]?.workosUserId).toBe(workosUserId);
    expect(deniedCalls[0]?.requestId).toMatch(/^req_/u);
  });

  it("returns an admitted actor when Runtime admission resolves a user", async () => {
    const admittedUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
    const { runtime } = createTestRuntime({ [workosUserId]: admittedUserId });
    const result = await resolveBrowserActor(sessionRequest(), createTestEnv(runtime));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.userId).toBe(admittedUserId);
      expect(result.actor.workosUserId).toBe(workosUserId);
    }
  });
});
