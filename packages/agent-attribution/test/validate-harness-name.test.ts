import { describe, expect, it } from "vitest";
import { isKnownHarnessCode, parseDeriveHarnessName } from "../src/validate-harness-name.js";

describe("validateHarnessName", () => {
  it("accepts registered harness codes for derive", () => {
    expect(parseDeriveHarnessName("agent.harness.claude_code")).toEqual({
      ok: true,
      harnessName: "agent.harness.claude_code",
    });
    expect(parseDeriveHarnessName(" agent.harness.cursor ")).toEqual({
      ok: true,
      harnessName: "agent.harness.cursor",
    });
  });

  it("rejects unknown or malformed harness codes for derive", () => {
    expect(parseDeriveHarnessName("agent.harness.anything")).toEqual({ ok: false });
    expect(parseDeriveHarnessName("claude-code")).toEqual({ ok: false });
    expect(parseDeriveHarnessName("")).toEqual({ ok: false });
    expect(parseDeriveHarnessName(undefined)).toEqual({ ok: false });
  });

  it("identifies known harness codes", () => {
    expect(isKnownHarnessCode("agent.harness.claude_code")).toBe(true);
    expect(isKnownHarnessCode("agent.harness.anything")).toBe(false);
  });
});
