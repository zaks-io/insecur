import { describe, expect, it } from "vitest";
import {
  CONSOLE_UNAVAILABLE_MESSAGE,
  ConsoleUnavailable,
  isConsoleUnavailable,
  throwConsoleUnavailable,
} from "./unavailable.js";

describe("ConsoleUnavailable sentinel", () => {
  it("is recognized on the server throwable", () => {
    expect(isConsoleUnavailable(new ConsoleUnavailable())).toBe(true);
  });

  it("is recognized after ShallowErrorPlugin rehydrates only the message", () => {
    expect(isConsoleUnavailable(new Error(CONSOLE_UNAVAILABLE_MESSAGE))).toBe(true);
  });

  it("is not confused with unrelated errors", () => {
    expect(isConsoleUnavailable(new Error("Console service unavailable"))).toBe(false);
    expect(isConsoleUnavailable({ isConsoleUnavailable: true })).toBe(true);
  });

  it("throwConsoleUnavailable throws the outage error", () => {
    try {
      throwConsoleUnavailable();
      expect.unreachable("expected throw");
    } catch (error) {
      expect(isConsoleUnavailable(error)).toBe(true);
    }
  });
});
