import pc from "picocolors";
import { resolveColorEnabled, type ColorFlag } from "./color-mode.js";

const identity = (value: string): string => value;

type GlyphName = "ok" | "fail" | "warn" | "bullet" | "arrow";

const UNICODE_GLYPHS: Record<GlyphName, string> = {
  ok: "✓",
  fail: "✗",
  warn: "⚠",
  bullet: "·",
  arrow: "→",
};

const ASCII_GLYPHS: Record<GlyphName, string> = {
  ok: "[ok]",
  fail: "[x]",
  warn: "[!]",
  bullet: "-",
  arrow: "->",
};

/**
 * Semantic style roles. Call sites name the role (`id`, `danger`, …), never a
 * raw color, so the palette lives in exactly one place. Every method is the
 * identity function when color is disabled, keeping non-TTY / --json / NO_COLOR
 * output byte-identical to uncolored prose.
 */
export interface Styler {
  readonly ok: (value: string) => string;
  readonly danger: (value: string) => string;
  readonly warn: (value: string) => string;
  readonly id: (value: string) => string;
  readonly label: (value: string) => string;
  readonly meta: (value: string) => string;
  readonly action: (value: string) => string;
  readonly heading: (value: string) => string;
  readonly glyph: (name: GlyphName) => string;
  readonly ascii: boolean;
}

function createGlyphResolver(ascii: boolean): (name: GlyphName) => string {
  const table = ascii ? ASCII_GLYPHS : UNICODE_GLYPHS;
  return (name) => table[name];
}

export function createStyler(opts: { color: boolean; ascii?: boolean }): Styler {
  const ascii = opts.ascii ?? false;
  const glyph = createGlyphResolver(ascii);
  if (!opts.color) {
    return {
      ok: identity,
      danger: identity,
      warn: identity,
      id: identity,
      label: identity,
      meta: identity,
      action: identity,
      heading: identity,
      glyph,
      ascii,
    };
  }
  const c = pc.createColors(true);
  return {
    ok: c.green,
    danger: c.red,
    warn: c.yellow,
    id: c.cyan,
    label: c.bold,
    meta: c.dim,
    action: c.underline,
    heading: c.bold,
    glyph,
    ascii,
  };
}

let activeStyler: Styler = createStyler({ color: false });

export function getStyle(): Styler {
  return activeStyler;
}

function asciiPreferred(env: NodeJS.ProcessEnv): boolean {
  if (env.INSECUR_ASCII !== undefined && env.INSECUR_ASCII !== "" && env.INSECUR_ASCII !== "0") {
    return true;
  }
  const locale = env.LC_ALL ?? env.LC_CTYPE ?? env.LANG ?? "";
  return locale !== "" && !/utf-?8/i.test(locale);
}

export interface ConfigureColorInput {
  readonly json: boolean;
  readonly color: ColorFlag;
}

export function configureColor(
  flags: ConfigureColorInput,
  env: NodeJS.ProcessEnv = process.env,
  isTTY = process.stdout.isTTY,
): void {
  const enabled =
    !flags.json &&
    resolveColorEnabled({
      flag: flags.color,
      forceColor: env.FORCE_COLOR,
      noColor: env.NO_COLOR,
      term: env.TERM,
      isTTY,
    });
  activeStyler = createStyler({ color: enabled, ascii: asciiPreferred(env) });
}

export function resetStyleForTests(): void {
  activeStyler = createStyler({ color: false });
}
