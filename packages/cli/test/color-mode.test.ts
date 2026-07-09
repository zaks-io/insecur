import { describe, expect, it } from "vitest";
import { resolveColorEnabled, type ColorModeInput } from "../src/output/color-mode.js";

function input(overrides: Partial<ColorModeInput>): ColorModeInput {
  return {
    flag: undefined,
    forceColor: undefined,
    noColor: undefined,
    term: undefined,
    isTTY: false,
    ...overrides,
  };
}

describe("resolveColorEnabled", () => {
  it("--no-color wins over everything", () => {
    expect(resolveColorEnabled(input({ flag: "never", forceColor: "1", isTTY: true }))).toBe(false);
  });

  it("--color wins over NO_COLOR and non-TTY", () => {
    expect(resolveColorEnabled(input({ flag: "always", noColor: "1", isTTY: false }))).toBe(true);
  });

  it("FORCE_COLOR enables when not 0/false", () => {
    expect(resolveColorEnabled(input({ forceColor: "1" }))).toBe(true);
    expect(resolveColorEnabled(input({ forceColor: "true" }))).toBe(true);
  });

  it("FORCE_COLOR=0/false does not enable", () => {
    expect(resolveColorEnabled(input({ forceColor: "0", isTTY: true }))).toBe(true);
    expect(resolveColorEnabled(input({ forceColor: "0", isTTY: false }))).toBe(false);
    expect(resolveColorEnabled(input({ forceColor: "false", isTTY: false }))).toBe(false);
  });

  it("NO_COLOR (any value) disables when no explicit flag", () => {
    expect(resolveColorEnabled(input({ noColor: "", isTTY: true }))).toBe(false);
    expect(resolveColorEnabled(input({ noColor: "1", isTTY: true }))).toBe(false);
  });

  it("TERM=dumb disables", () => {
    expect(resolveColorEnabled(input({ term: "dumb", isTTY: true }))).toBe(false);
  });

  it("falls back to TTY when nothing else applies", () => {
    expect(resolveColorEnabled(input({ isTTY: true }))).toBe(true);
    expect(resolveColorEnabled(input({ isTTY: false }))).toBe(false);
  });
});
