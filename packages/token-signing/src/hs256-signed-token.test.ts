import { describe, expect, it } from "vitest";
import { base64UrlToBytes } from "@insecur/domain";
import {
  decodeSignedHs256PayloadBody,
  decodeSignedHs256Token,
  encodeSignedHs256Token,
  parseSignedHs256TokenParts,
  verifySignedHs256Signature,
} from "./hs256-signed-token.js";

const SECRET = "test-token-signing-secret";

describe("signed HS256 token codec", () => {
  function encodeBody(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
  }

  function decodeTokenHeader(token: string): unknown {
    const header = token.split(".")[0];
    if (header === undefined) {
      return null;
    }
    const bytes = base64UrlToBytes(header);
    if (bytes === null) {
      return null;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  it("round-trips a payload object", async () => {
    const token = await encodeSignedHs256Token(
      { sub: "actor", typ: "test_v1", exp: 9_999_999_999 },
      SECRET,
    );
    const decoded = await decodeSignedHs256Token(token, SECRET);
    expect(decoded).toEqual({ sub: "actor", typ: "test_v1", exp: 9_999_999_999 });
    expect(decodeTokenHeader(token)).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("rejects malformed token structure", async () => {
    expect(await decodeSignedHs256Token("only.two", SECRET)).toBeNull();
    expect(parseSignedHs256TokenParts("a.b")).toBeNull();
    expect(parseSignedHs256TokenParts("a.b.c.d")).toBeNull();
    expect(parseSignedHs256TokenParts("a.b.c")).toEqual({
      signingInput: "a.b",
      body: "b",
      signature: "c",
    });
  });

  it("rejects invalid base64url signature", async () => {
    expect(await decodeSignedHs256Token("a.b.!", SECRET)).toBeNull();
    expect(await verifySignedHs256Signature("a.b", "!", SECRET)).toBe(false);
  });

  it("rejects invalid base64url body", () => {
    expect(decodeSignedHs256PayloadBody("!")).toBeNull();
  });

  it("rejects malformed and non-object JSON payload bodies", () => {
    for (const body of [
      Buffer.from("{").toString("base64url"),
      encodeBody(["not", "an", "object"]),
      encodeBody("not an object"),
      encodeBody(123),
      encodeBody(null),
    ]) {
      expect(decodeSignedHs256PayloadBody(body)).toBeNull();
    }

    expect(decodeSignedHs256PayloadBody(encodeBody({ sub: "actor", ok: true }))).toEqual({
      sub: "actor",
      ok: true,
    });
  });

  it("rejects wrong signatures", async () => {
    const token = await encodeSignedHs256Token({ sub: "actor" }, SECRET);
    expect(await decodeSignedHs256Token(token, `${SECRET}x`)).toBeNull();
  });

  it("rejects array payloads before signing", async () => {
    await expect(encodeSignedHs256Token(["not", "an", "object"], SECRET)).rejects.toThrow(
      "Invalid signed HS256 payload",
    );
  });

  it("rejects non-plain object payloads before signing", async () => {
    await expect(encodeSignedHs256Token(new Date(), SECRET)).rejects.toThrow(
      "Invalid signed HS256 payload",
    );
    await expect(encodeSignedHs256Token(null as never, SECRET)).rejects.toThrow(
      "Invalid signed HS256 payload",
    );
    await expect(encodeSignedHs256Token("not an object" as never, SECRET)).rejects.toThrow(
      "Invalid signed HS256 payload",
    );
  });

  it("rejects callable object payloads before signing", async () => {
    const callable = Object.assign(() => undefined, { sub: "actor" });
    await expect(encodeSignedHs256Token(callable, SECRET)).rejects.toThrow(
      "Invalid signed HS256 payload",
    );
  });

  it("rejects object payloads with non-round-trippable values before signing", async () => {
    const invalidPayloads = [
      { sub: "actor", issuedAt: new Date() },
      { sub: "actor", handler: () => undefined },
      { sub: "actor", marker: Symbol("token") },
      { sub: "actor", count: BigInt(1) },
      { sub: "actor", missing: undefined },
      { sub: "actor", nested: [1, undefined] },
      { sub: "actor", nested: { issuedAt: new Date() } },
    ];

    for (const payload of invalidPayloads) {
      await expect(encodeSignedHs256Token(payload, SECRET)).rejects.toThrow(
        "Invalid signed HS256 payload",
      );
    }
  });

  it("accepts nested plain JSON values before signing", async () => {
    const payload = {
      sub: "actor",
      active: true,
      optional: null,
      tags: ["one", 2, false],
      nested: { scope: "session", attempts: 1 },
    };

    await expect(encodeSignedHs256Token(payload, SECRET)).resolves.toEqual(expect.any(String));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite number payload values before signing (%s)",
    async (value) => {
      await expect(encodeSignedHs256Token({ sub: "actor", exp: value }, SECRET)).rejects.toThrow(
        "Invalid signed HS256 payload",
      );
    },
  );
});
