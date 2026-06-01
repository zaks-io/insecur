import { describe, expect, it } from "vitest";
import { base64UrlToBytes, bytesToBase64Url } from "./base64url.js";

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

describe("bytesToBase64Url / base64UrlToBytes", () => {
  it("round-trips random byte arrays including empty and lengths not divisible by 3", () => {
    const lengths = [0, 1, 2, 3, 4, 5, 7, 16, 31, 32, 33] as const;
    for (const length of lengths) {
      const original = randomBytes(length);
      const encoded = bytesToBase64Url(original);
      const decoded = base64UrlToBytes(encoded);
      expect(decoded).not.toBeNull();
      expect(decoded).toEqual(original);
    }
  });

  it("strips padding on encode and restores it on decode", () => {
    const bytes = new Uint8Array([0, 0, 0]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toMatch(/=/u);
    expect(base64UrlToBytes(encoded)).toEqual(bytes);
  });

  it("uses - and _ instead of + and /", () => {
    const bytes = new Uint8Array([251, 255, 254]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/]/u);
    expect(encoded).toMatch(/[-_]/u);
    expect(base64UrlToBytes(encoded)).toEqual(bytes);
  });

  it("returns null for malformed input with bad characters", () => {
    expect(base64UrlToBytes("not!!!valid")).toBeNull();
    expect(base64UrlToBytes("abc def")).toBeNull();
    expect(base64UrlToBytes("+/")).toBeNull();
    expect(base64UrlToBytes("-/")).toBeNull();
    expect(base64UrlToBytes("a+b/c")).toBeNull();
    expect(base64UrlToBytes("YWJj+")).toBeNull();
  });

  it("returns null for malformed input with invalid base64 length", () => {
    expect(base64UrlToBytes("a")).toBeNull();
    expect(base64UrlToBytes("aaaaa")).toBeNull();
  });
});
