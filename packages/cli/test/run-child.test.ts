import { describe, expect, it } from "vitest";
import { bytesToBase64Url, INJECTION_ERROR_CODES } from "@insecur/domain";
import {
  buildPolicyRunChildEnv,
  buildRunChildEnv,
  decodeDeliveryValue,
} from "../src/commands/run-child.js";
import { CLI_CHILD_BASELINE_ENV_KEYS } from "../src/auth/child-env.js";

describe("run-child helpers", () => {
  it("decodes base64url delivery payloads", () => {
    const encoded = bytesToBase64Url(new TextEncoder().encode("runtime-secret"));
    expect(decodeDeliveryValue(encoded)).toBe("runtime-secret");
  });

  it("rejects undecodable delivery payloads", () => {
    expect(() => decodeDeliveryValue("not-valid-base64url!!!")).toThrow(
      expect.objectContaining({
        code: INJECTION_ERROR_CODES.decryptFailed,
      }),
    );
  });

  it("builds child env with one injected variable key", () => {
    const env = buildRunChildEnv("API_KEY", "runtime-secret");
    expect(env.API_KEY).toBe("runtime-secret");
    expect(
      Object.keys(env).every((name) => [...CLI_CHILD_BASELINE_ENV_KEYS, "API_KEY"].includes(name)),
    ).toBe(true);
  });

  it("builds child env for all policy-bound variables", () => {
    const env = buildPolicyRunChildEnv([
      {
        variableKey: "API_KEY",
        encodedValueUtf8: bytesToBase64Url(new TextEncoder().encode("secret-a")),
      },
      {
        variableKey: "DATABASE_URL",
        encodedValueUtf8: bytesToBase64Url(new TextEncoder().encode("secret-b")),
      },
    ]);
    expect(env.API_KEY).toBe("secret-a");
    expect(env.DATABASE_URL).toBe("secret-b");
  });
});
