import { testSessionSigningSecret } from "@insecur/auth";
import { userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import type { AuthWorkerEnv } from "../auth-worker-env.js";
import {
  createFakeAdmittedUserResolver,
  createTestAuthContext,
  parseFakeAdmissionsJson,
} from "./create-test-auth-context.js";
import { createFakeAdmissionRuntime } from "./fake-admission-runtime.js";

const env: AuthWorkerEnv = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  RUNTIME: createFakeAdmissionRuntime(),
};

const admittedUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");

describe("parseFakeAdmissionsJson", () => {
  it("returns an empty map for missing or blank input", () => {
    expect(parseFakeAdmissionsJson(undefined)).toEqual({});
    expect(parseFakeAdmissionsJson("   ")).toEqual({});
  });

  it("keeps only valid user id entries", () => {
    expect(
      parseFakeAdmissionsJson(
        JSON.stringify({
          user_ok: admittedUserId,
          user_bad: 42,
          user_invalid: "not-a-user-id",
        }),
      ),
    ).toEqual({ user_ok: admittedUserId });
  });
});

describe("createTestAuthContext", () => {
  it("wires fake admission resolution by default", async () => {
    const context = createTestAuthContext(env, { user_01workos: admittedUserId });
    await expect(context.resolveAdmittedUser("user_01workos")).resolves.toBe(admittedUserId);
  });
});

describe("createFakeAdmittedUserResolver", () => {
  it("resolves known WorkOS subjects and rejects unknown ones", async () => {
    const resolve = createFakeAdmittedUserResolver({ user_01workos: admittedUserId });
    await expect(resolve("user_01workos")).resolves.toBe(admittedUserId);
    await expect(resolve("user_unknown")).resolves.toBeNull();
  });
});
