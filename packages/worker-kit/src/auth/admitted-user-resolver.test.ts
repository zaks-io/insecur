import { describe, expect, it } from "vitest";
import { testSessionSigningSecret } from "@insecur/auth";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import {
  createRuntimeAdmittedUserResolver,
  recordAdmissionDeniedViaBinding,
  resolveAdmissionViaBinding,
  resolveInstanceId,
} from "./admitted-user-resolver.js";
import {
  createFakeAdmissionRuntime,
  fakeAdmittedUserId,
} from "./testing/fake-admission-runtime.js";

function envWith(runtime: AuthWorkerEnv["RUNTIME"], instanceId?: string): AuthWorkerEnv {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    RUNTIME: runtime,
    ...(instanceId !== undefined ? { INSTANCE_ID: instanceId } : {}),
  };
}

describe("resolveInstanceId", () => {
  it("uses INSTANCE_ID when set", () => {
    const env = envWith(createFakeAdmissionRuntime(), "inst_PREVIEW");
    expect(resolveInstanceId(env)).toBe("inst_PREVIEW");
  });

  it("falls back to inst_LOCAL_DEV when INSTANCE_ID is absent", () => {
    expect(resolveInstanceId(envWith(createFakeAdmissionRuntime()))).toBe("inst_LOCAL_DEV");
  });
});

describe("resolveAdmissionViaBinding", () => {
  it("returns the admitted user id from the runtime", async () => {
    const admitted = fakeAdmittedUserId();
    const runtime = createFakeAdmissionRuntime({ user_workos: admitted });
    await expect(
      resolveAdmissionViaBinding(runtime, { instanceId: "inst_TEST", workosUserId: "user_workos" }),
    ).resolves.toBe(admitted);
  });

  it("returns null for an unknown subject", async () => {
    const runtime = createFakeAdmissionRuntime();
    await expect(
      resolveAdmissionViaBinding(runtime, { instanceId: "inst_TEST", workosUserId: "user_x" }),
    ).resolves.toBeNull();
  });
});

describe("createRuntimeAdmittedUserResolver", () => {
  it("binds the env instance id and forwards over the runtime", async () => {
    const admitted = fakeAdmittedUserId();
    const runtime = createFakeAdmissionRuntime({ user_known: admitted });
    const resolve = createRuntimeAdmittedUserResolver(envWith(runtime, "inst_ENV"));
    await expect(resolve("user_known")).resolves.toBe(admitted);
    await expect(resolve("user_unknown")).resolves.toBeNull();
  });
});

describe("recordAdmissionDeniedViaBinding", () => {
  it("forwards the denied-admission audit to the runtime", async () => {
    const runtime = createFakeAdmissionRuntime();
    await recordAdmissionDeniedViaBinding(runtime, {
      instanceId: "inst_TEST",
      workosUserId: "user_denied",
      requestId: "req_test" as never,
    });
    expect(runtime.deniedCalls).toEqual([
      { instanceId: "inst_TEST", workosUserId: "user_denied", requestId: "req_test" },
    ]);
  });
});
