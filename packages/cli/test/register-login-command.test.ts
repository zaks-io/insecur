import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  assertDeviceOptionCombination,
  parseLoginCallbackPort,
  parseLoginCallbackTimeout,
} from "../src/register-login-command.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";

function expectInvalidCommandInput(run: () => void, message: string): void {
  let error: unknown;
  try {
    run();
  } catch (caught) {
    error = caught;
  }
  expect(error).toMatchObject({
    code: VALIDATION_ERROR_CODES.invalidCommandInput,
    exitCode: EXIT_VALIDATION,
    message,
  });
}

describe("parseLoginCallbackPort", () => {
  it.each(["1", "49152", "65535"])("accepts valid port %s", (value) => {
    expect(parseLoginCallbackPort(value)).toBe(Number(value));
  });

  it("preserves an omitted callback port", () => {
    expect(parseLoginCallbackPort(undefined)).toBeUndefined();
  });

  it.each(["0", "-1", "65536", "123abc", "abc", "1.5", ""])("rejects invalid port %s", (value) => {
    expectInvalidCommandInput(() => {
      parseLoginCallbackPort(value);
    }, "--callback-port must be a whole integer from 1 to 65535.");
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
    expectInvalidCommandInput(() => {
      parseLoginCallbackTimeout(value);
    }, "--callback-timeout must be a whole number of seconds from 1 to 3600.");
  });
});

describe("assertDeviceOptionCombination", () => {
  it("rejects --agent-session without --device (exit 2)", () => {
    expectInvalidCommandInput(() => {
      assertDeviceOptionCombination({ agentSession: true, device: false });
    }, "--agent-session is only valid together with --device.");
  });

  it.each([
    { name: "--device --agent-session together", options: { agentSession: true, device: true } },
    { name: "loopback PKCE defaults", options: {} },
    { name: "explicit loopback PKCE", options: { device: false } },
    { name: "--device without --agent-session", options: { device: true } },
  ])("allows $name", ({ options }) => {
    assertDeviceOptionCombination(options);
  });
});
