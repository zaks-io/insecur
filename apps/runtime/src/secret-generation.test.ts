import { SECRET_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { generateSecretValueUtf8 } from "./secret-generation.js";

describe("generateSecretValueUtf8", () => {
  it("generates URL-safe UTF-8 text from runtime-local entropy", () => {
    const first = new TextDecoder().decode(
      generateSecretValueUtf8({ mode: "random", lengthBytes: 32 }),
    );
    const second = new TextDecoder().decode(
      generateSecretValueUtf8({ mode: "random", lengthBytes: 32 }),
    );

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects invalid generation lengths with stable secret errors", () => {
    expect(() => generateSecretValueUtf8({ mode: "random", lengthBytes: 0 })).toThrow(
      expect.objectContaining({ code: SECRET_ERROR_CODES.invalidInputMode }),
    );
    expect(() => generateSecretValueUtf8({ mode: "random", lengthBytes: 49153 })).toThrow(
      expect.objectContaining({ code: SECRET_ERROR_CODES.valueTooLarge }),
    );
  });
});
