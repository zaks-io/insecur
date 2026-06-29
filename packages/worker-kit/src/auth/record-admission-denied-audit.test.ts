import { requestId } from "@insecur/domain";
import {
  authFailureForAdmissionDenial,
  authFailureForReason,
  testSessionSigningSecret,
} from "@insecur/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthWorkerEnv, RuntimeAdmissionRpc } from "./auth-worker-env.js";
import { recordAdmissionDeniedAuditForAuthFailure } from "./record-admission-denied-audit.js";
import { createFakeAdmissionRuntime } from "./testing/fake-admission-runtime.js";

const instanceId = "inst_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
const workosUserId = "user_01workos";
const reqId = requestId.brand("req_01JZ8E2QYQ6M7F4K9A2B3C4D5E");

function envWith(runtime: RuntimeAdmissionRpc): AuthWorkerEnv {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    INSTANCE_ID: instanceId,
    RUNTIME: runtime,
  };
}

describe("recordAdmissionDeniedAuditForAuthFailure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing for non-admission auth failures", async () => {
    const runtime = createFakeAdmissionRuntime();
    await recordAdmissionDeniedAuditForAuthFailure(
      envWith(runtime),
      authFailureForReason("missing"),
      reqId,
    );
    expect(runtime.deniedCalls).toHaveLength(0);
  });

  it("forwards the denied-admission audit to the runtime for not_admitted failures", async () => {
    const runtime = createFakeAdmissionRuntime();
    await recordAdmissionDeniedAuditForAuthFailure(
      envWith(runtime),
      authFailureForAdmissionDenial(workosUserId),
      reqId,
    );
    expect(runtime.deniedCalls).toEqual([{ instanceId, workosUserId, requestId: reqId }]);
  });

  it("does not throw when the runtime forward fails", async () => {
    const runtime: RuntimeAdmissionRpc = {
      resolveAdmission: () => Promise.reject(new Error("binding down")),
      recordAdmissionDenied: () => Promise.reject(new Error("binding down")),
    };
    await expect(
      recordAdmissionDeniedAuditForAuthFailure(
        envWith(runtime),
        authFailureForAdmissionDenial(workosUserId),
        reqId,
      ),
    ).resolves.toBeUndefined();
  });
});
