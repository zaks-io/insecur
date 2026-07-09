import { afterEach, describe, expect, it } from "vitest";
import {
  configureColor,
  createStyler,
  getStyle,
  resetStyleForTests,
  type Styler,
} from "../src/output/style.js";

const ESC = String.fromCharCode(27);
const ROLES: (keyof Omit<Styler, "glyph" | "ascii">)[] = [
  "ok",
  "danger",
  "warn",
  "id",
  "label",
  "meta",
  "action",
  "heading",
];

afterEach(() => {
  resetStyleForTests();
});

describe("createStyler", () => {
  it("is the identity function for every role when color is off", () => {
    const s = createStyler({ color: false });
    for (const role of ROLES) {
      expect(s[role]("value")).toBe("value");
    }
  });

  it("emits reset-terminated ANSI for every role when color is on", () => {
    const s = createStyler({ color: true });
    for (const role of ROLES) {
      const out = s[role]("value");
      expect(out).toContain(ESC);
      expect(out.endsWith("m")).toBe(true);
    }
  });

  it("resolves unicode glyphs by default and ASCII when requested", () => {
    expect(createStyler({ color: false }).glyph("ok")).toBe("✓");
    expect(createStyler({ color: false }).glyph("bullet")).toBe("·");
    const ascii = createStyler({ color: false, ascii: true });
    expect(ascii.glyph("ok")).toBe("[ok]");
    expect(ascii.glyph("arrow")).toBe("->");
  });

  it("leaves glyphs uncolored so status color comes from roles, not markers", () => {
    const s = createStyler({ color: true });
    expect(s.glyph("bullet")).toBe("·");
    expect(s.glyph("arrow")).toBe("→");
  });

  it("exposes the resolved ascii mode", () => {
    expect(createStyler({ color: true, ascii: true }).ascii).toBe(true);
    expect(createStyler({ color: true }).ascii).toBe(false);
  });
});

describe("configureColor", () => {
  it("forces color off for --json even when --color is requested", () => {
    configureColor({ json: true, color: "always" }, {}, true);
    expect(getStyle().id("env_ab")).toBe("env_ab");
  });

  it("honors an explicit --color override on a non-TTY stream", () => {
    configureColor({ json: false, color: "always" }, {}, false);
    expect(getStyle().id("env_ab")).toContain(ESC);
  });

  it("disables color under NO_COLOR", () => {
    configureColor({ json: false, color: undefined }, { NO_COLOR: "1" }, true);
    expect(getStyle().id("env_ab")).toBe("env_ab");
  });

  it("selects ASCII glyphs under INSECUR_ASCII", () => {
    configureColor({ json: false, color: undefined }, { INSECUR_ASCII: "1" }, false);
    expect(getStyle().glyph("ok")).toBe("[ok]");
    expect(getStyle().ascii).toBe(true);
  });
});
