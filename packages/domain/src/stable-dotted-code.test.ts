import { describe, expect, it } from "vitest";
import {
  isStableDottedCode,
  STABLE_DOTTED_CODE_MAX_LENGTH,
  STABLE_DOTTED_CODE_PATTERN,
} from "./stable-dotted-code.js";

describe("STABLE_DOTTED_CODE_PATTERN", () => {
  it("documents the shared stable dotted vocabulary format", () => {
    expect(STABLE_DOTTED_CODE_PATTERN.source).toBe("^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$");
  });
});

describe("isStableDottedCode", () => {
  it("accepts valid dotted codes", () => {
    const validCodes = [
      "auth.insufficient_scope",
      "secret.invalid_encoding",
      "sync.run",
      "provider.reauth",
      "a.b",
    ] as const;

    for (const code of validCodes) {
      expect(isStableDottedCode(code)).toBe(true);
    }
  });

  it("rejects invalid dotted codes", () => {
    const invalidCodes = [
      "",
      "not_a_dotted_code",
      "auth",
      "AUTH.insufficient_scope",
      "auth.insufficient scope",
      "auth..insufficient_scope",
      "1auth.invalid",
      "auth.1invalid",
    ] as const;

    for (const code of invalidCodes) {
      expect(isStableDottedCode(code)).toBe(false);
    }
  });

  it("rejects codes longer than the max length", () => {
    const overLength = `${"a.".repeat(64)}b`;
    expect(overLength.length).toBeGreaterThan(STABLE_DOTTED_CODE_MAX_LENGTH);
    expect(isStableDottedCode(overLength)).toBe(false);

    const atMaxLength = `${"a.".repeat(62)}b.cd`;
    expect(atMaxLength.length).toBe(STABLE_DOTTED_CODE_MAX_LENGTH);
    expect(isStableDottedCode(atMaxLength)).toBe(true);
  });
});
