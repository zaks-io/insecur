import { describe, expect, it } from "vitest";
import { parseLoginCallbackPort } from "../src/register-login-command.js";

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
