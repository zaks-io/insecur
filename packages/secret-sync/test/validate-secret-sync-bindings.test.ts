import { AUTH_ERROR_CODES, SECRET_SYNC_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { SecretSyncError } from "../src/secret-sync-error.js";
import { validateSecretSyncBindings } from "../src/validate-secret-sync-bindings.js";

describe("validateSecretSyncBindings", () => {
  it("accepts exact secret id and provider destination bindings", () => {
    const result = validateSecretSyncBindings([
      {
        secretId: "sec_00000000000000000000000001",
        providerDestination: "DATABASE_URL",
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.providerDestination).toBe("DATABASE_URL");
  });

  it("rejects empty bindings", () => {
    expect(() => validateSecretSyncBindings([])).toThrow(
      expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.invalidBindings }),
    );
  });

  it("rejects wildcard secret selection", () => {
    expect(() =>
      validateSecretSyncBindings([{ secretId: "sec_*", providerDestination: "DATABASE_URL" }]),
    ).toThrow(expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.patternBindingRejected }));
  });

  it("rejects pattern provider destinations", () => {
    expect(() =>
      validateSecretSyncBindings([
        {
          secretId: "sec_00000000000000000000000001",
          providerDestination: "prefix:DATABASE_",
        },
      ]),
    ).toThrow(expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.patternBindingRejected }));
  });

  it("rejects duplicate secret bindings", () => {
    expect(() =>
      validateSecretSyncBindings([
        {
          secretId: "sec_00000000000000000000000001",
          providerDestination: "DATABASE_URL",
        },
        {
          secretId: "sec_00000000000000000000000001",
          providerDestination: "API_KEY",
        },
      ]),
    ).toThrow(expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.invalidBindings }));
  });

  it("rejects duplicate provider destinations", () => {
    expect(() =>
      validateSecretSyncBindings([
        {
          secretId: "sec_00000000000000000000000001",
          providerDestination: "DATABASE_URL",
        },
        {
          secretId: "sec_00000000000000000000000002",
          providerDestination: "DATABASE_URL",
        },
      ]),
    ).toThrow(expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.invalidBindings }));
  });

  it("throws SecretSyncError for invalid secret ids", () => {
    try {
      validateSecretSyncBindings([
        { secretId: "not-a-secret-id", providerDestination: "DATABASE_URL" },
      ]);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SecretSyncError);
      expect((error as SecretSyncError).code).toBe(SECRET_SYNC_ERROR_CODES.invalidBindings);
    }
  });

  it("rejects empty provider destinations", () => {
    expect(() =>
      validateSecretSyncBindings([
        { secretId: "sec_00000000000000000000000001", providerDestination: "   " },
      ]),
    ).toThrow(expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.invalidDestination }));
  });
});

describe("validateSecretSyncBindings error typing", () => {
  it("does not use auth error codes for binding validation failures", () => {
    try {
      validateSecretSyncBindings([]);
    } catch (error) {
      expect((error as SecretSyncError).code).not.toBe(AUTH_ERROR_CODES.insufficientScope);
    }
  });
});
