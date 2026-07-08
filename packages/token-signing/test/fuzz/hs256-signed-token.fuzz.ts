import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  decodeSignedHs256Token,
  encodeSignedHs256Token,
  parseSignedHs256TokenParts,
} from "../../src/hs256-signed-token.js";

const signingSecretArb = fc.string({ minLength: 32, maxLength: 96 });
const payloadArb = fc.dictionary(fc.string({ minLength: 1, maxLength: 24 }), fc.jsonValue(), {
  maxKeys: 8,
});

function flipTokenChar(token: string): string {
  const replacement = token[0] === "A" ? "B" : "A";
  return `${replacement}${token.slice(1)}`;
}

function normalizedJsonObject(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("HS256 signed token fuzz", () => {
  it("round-trips arbitrary JSON object payloads under the signing secret", async () => {
    await fc.assert(
      fc.asyncProperty(payloadArb, signingSecretArb, async (payload, signingSecret) => {
        const token = await encodeSignedHs256Token(payload, signingSecret);

        expect(await decodeSignedHs256Token(token, signingSecret)).toEqual(
          normalizedJsonObject(payload),
        );
        expect(parseSignedHs256TokenParts(token)).not.toBeNull();
      }),
    );
  });

  it("rejects tampered signing input or wrong signing secret", async () => {
    await fc.assert(
      fc.asyncProperty(payloadArb, signingSecretArb, async (payload, signingSecret) => {
        const token = await encodeSignedHs256Token(payload, signingSecret);

        expect(await decodeSignedHs256Token(flipTokenChar(token), signingSecret)).toBeNull();
        expect(await decodeSignedHs256Token(token, `${signingSecret}x`)).toBeNull();
      }),
    );
  });
});
