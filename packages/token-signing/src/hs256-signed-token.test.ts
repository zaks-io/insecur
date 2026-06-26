import { describe, expect, it } from "vitest";
import {
  decodeSignedHs256PayloadBody,
  decodeSignedHs256Token,
  encodeSignedHs256Token,
  parseSignedHs256TokenParts,
  verifySignedHs256Signature,
} from "./hs256-signed-token.js";

const SECRET = "test-token-signing-secret";

describe("signed HS256 token codec", () => {
  it("round-trips a payload object", async () => {
    const token = await encodeSignedHs256Token(
      { sub: "actor", typ: "test_v1", exp: 9_999_999_999 },
      SECRET,
    );
    const decoded = await decodeSignedHs256Token(token, SECRET);
    expect(decoded).toEqual({ sub: "actor", typ: "test_v1", exp: 9_999_999_999 });
  });

  it("rejects malformed token structure", async () => {
    expect(await decodeSignedHs256Token("only.two", SECRET)).toBeNull();
    expect(parseSignedHs256TokenParts("a.b")).toBeNull();
  });

  it("rejects invalid base64url signature", async () => {
    expect(await decodeSignedHs256Token("a.b.!", SECRET)).toBeNull();
    expect(await verifySignedHs256Signature("a.b", "!", SECRET)).toBe(false);
  });

  it("rejects invalid base64url body", () => {
    expect(decodeSignedHs256PayloadBody("!")).toBeNull();
  });

  it("rejects non-object JSON payloads", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const arrayBody = Buffer.from(JSON.stringify(["not", "an", "object"])).toString("base64url");
    const token = `${header}.${arrayBody}.signature`;
    expect(parseSignedHs256TokenParts(token)).not.toBeNull();
    expect(decodeSignedHs256PayloadBody(arrayBody)).toBeNull();
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

  it("rejects Date payloads before signing", async () => {
    await expect(encodeSignedHs256Token(new Date(), SECRET)).rejects.toThrow(
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
    await expect(
      encodeSignedHs256Token({ sub: "actor", issuedAt: new Date() }, SECRET),
    ).rejects.toThrow("Invalid signed HS256 payload");
    await expect(
      encodeSignedHs256Token({ sub: "actor", handler: () => undefined }, SECRET),
    ).rejects.toThrow("Invalid signed HS256 payload");
  });
});
