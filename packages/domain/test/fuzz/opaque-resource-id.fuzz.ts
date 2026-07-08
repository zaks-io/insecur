import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  OPAQUE_RESOURCE_ID_PATTERN,
  parseOpaqueResourceId,
  type OpaqueResourceIdPrefix,
} from "../../src/opaque-resource-id.js";

const PREFIXES = [
  "org",
  "prj",
  "env",
  "team",
  "mem",
  "sec",
  "sv",
  "ss",
  "rp",
  "rpv",
  "prof",
  "igr",
  "aud",
  "op",
  "req",
  "apr",
  "usr",
  "uad",
  "stg",
  "inv",
  "mach",
  "mauth",
  "conn",
  "pcred",
  "preg",
  "fvb",
  "chlg",
  "ags",
  "whsub",
  "whsec",
  "inev",
] as const satisfies readonly OpaqueResourceIdPrefix[];

function bodyChar(index: number): string {
  return index.toString(36).toUpperCase();
}

const prefixArb = fc.constantFrom(...PREFIXES);
const bodyArb = fc
  .array(fc.integer({ min: 0, max: 35 }).map(bodyChar), { minLength: 26, maxLength: 26 })
  .map((chars) => chars.join(""));
const validOpaqueResourceIdArb = fc
  .tuple(prefixArb, bodyArb)
  .map(([prefix, body]) => ({ prefix, raw: `${prefix}_${body}` }));

function nextPrefix(prefix: OpaqueResourceIdPrefix): OpaqueResourceIdPrefix {
  const index = PREFIXES.indexOf(prefix);
  return PREFIXES[(index + 1) % PREFIXES.length] ?? "org";
}

describe("opaque resource id fuzz", () => {
  it("accepts every generated prefix and 26-character uppercase body", () => {
    fc.assert(
      fc.property(validOpaqueResourceIdArb, ({ prefix, raw }) => {
        expect(parseOpaqueResourceId(raw)).toEqual({ ok: true, value: raw });
        expect(parseOpaqueResourceId(raw, prefix)).toEqual({ ok: true, value: raw });
        expect(parseOpaqueResourceId(raw, nextPrefix(prefix))).toEqual({
          ok: false,
          code: "validation.invalid_opaque_resource_id",
        });
      }),
      { examples: [[{ prefix: "org", raw: "org_01TEST00000000000000000001" }]] },
    );
  });

  it("only returns ok values matching the public opaque id pattern", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 96 }), (raw) => {
        const parsed = parseOpaqueResourceId(raw);

        if (parsed.ok) {
          expect(parsed.value).toMatch(OPAQUE_RESOURCE_ID_PATTERN);
          return;
        }

        expect(parsed.code).toBe("validation.invalid_opaque_resource_id");
      }),
      {
        examples: [
          [""],
          ["org_01TEST00000000000000000001"],
          ["ORG_01TEST00000000000000000001"],
          ["org_01test00000000000000000001"],
          ["org_01TEST0000000000000000000"],
        ],
      },
    );
  });
});
