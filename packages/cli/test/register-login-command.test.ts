import { describe, expect, it } from "vitest";
import {
  assertDeviceOptionCombination,
  parseLoginCallbackPort,
  parseLoginCallbackTimeout,
} from "../src/register-login-command.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";

describe("parseLoginCallbackPort", () => {
  it.each(["1", "49152", "65535"])("accepts valid port %s", (value) => {
    expect(parseLoginCallbackPort(value)).toBe(Number(value));
  });

  it("preserves an omitted callback port", () => {
    expect(parseLoginCallbackPort(undefined)).toBeUndefined();
  });

  it.each(["0", "-1", "65536", "123abc", "abc", "1.5", ""])("rejects invalid port %s", (value) => {
    expect(() => parseLoginCallbackPort(value)).toThrow(/--callback-port/);
  });
});

describe("parseLoginCallbackTimeout", () => {
  it.each(["1", "300", "3600"])("accepts valid timeout %s", (value) => {
    expect(parseLoginCallbackTimeout(value)).toBe(Number(value));
  });

  it("preserves an omitted callback timeout", () => {
    expect(parseLoginCallbackTimeout(undefined)).toBeUndefined();
  });

  it.each(["0", "-1", "3601", "30abc", "abc", "1.5", ""])("rejects invalid timeout %s", (value) => {
    expect(() => parseLoginCallbackTimeout(value)).toThrow(/--callback-timeout/);
  });
});

describe("assertDeviceOptionCombination", () => {
  it("rejects --agent-session without --device (exit 2)", () => {
    let thrown: unknown;
    try {
      assertDeviceOptionCombination({ agentSession: true, device: false });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: "validation.invalid_command_input",
      exitCode: EXIT_VALIDATION,
    });
  });

  it("allows --device --agent-session together", () => {
    expect(() => assertDeviceOptionCombination({ agentSession: true, device: true })).not.toThrow();
  });

  it("allows loopback PKCE login with neither flag (default path unchanged)", () => {
    expect(() => assertDeviceOptionCombination({})).not.toThrow();
    expect(() => assertDeviceOptionCombination({ device: false })).not.toThrow();
  });

  it("allows --device without --agent-session", () => {
    expect(() => assertDeviceOptionCombination({ device: true })).not.toThrow();
  });
});
