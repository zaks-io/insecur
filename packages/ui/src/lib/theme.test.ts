import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme.js";

describe("THEME_INIT_SCRIPT", () => {
  it("reads the shared storage key (kept literal in the script; guards against drift)", () => {
    expect(THEME_INIT_SCRIPT).toContain(
      `localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})`,
    );
  });

  it("stays a self-contained statement safe to inline in <head>", () => {
    expect(THEME_INIT_SCRIPT).toMatch(
      /^\(function \(\) \{ try \{ .* \} catch \(e\) \{\} \}\)\(\);$/,
    );
    expect(THEME_INIT_SCRIPT).not.toContain("</script");
  });
});
