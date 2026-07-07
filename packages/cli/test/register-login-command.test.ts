import { describe, expect, it } from "vitest";
import {
  parseLoginCallbackPort,
  parseLoginCallbackTimeout,
} from "../src/register-login-command.js";

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
