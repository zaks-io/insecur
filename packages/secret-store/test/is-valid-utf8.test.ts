import { describe, expect, it } from "vitest";

import { isValidUtf8 } from "../src/is-valid-utf8.js";

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe("isValidUtf8", () => {
  it("accepts empty input", () => {
    expect(isValidUtf8(new Uint8Array(0))).toBe(true);
  });

  it("accepts single-byte ASCII including control characters and DEL", () => {
    expect(isValidUtf8(bytes(0x00))).toBe(true);
    expect(isValidUtf8(bytes(0x7f))).toBe(true);
    expect(isValidUtf8(bytes(0x41, 0x42, 0x43))).toBe(true);
  });

  it("accepts valid two-byte sequences at boundary code points", () => {
    expect(isValidUtf8(bytes(0xc2, 0x80))).toBe(true);
    expect(isValidUtf8(bytes(0xdf, 0xbf))).toBe(true);
  });

  it("rejects overlong and out-of-range two-byte lead bytes", () => {
    expect(isValidUtf8(bytes(0xc0, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xc1, 0xbf))).toBe(false);
    expect(isValidUtf8(bytes(0xe0, 0x80, 0x80))).toBe(false);
  });

  it("rejects truncated or malformed two-byte sequences", () => {
    expect(isValidUtf8(bytes(0xc2))).toBe(false);
    expect(isValidUtf8(bytes(0xc2, 0x7f))).toBe(false);
    expect(isValidUtf8(bytes(0xc2, 0xc0))).toBe(false);
    expect(isValidUtf8(bytes(0xdf, 0x40))).toBe(false);
  });

  it("accepts valid three-byte sequences for each lead-byte branch", () => {
    expect(isValidUtf8(bytes(0xe0, 0xa0, 0x80))).toBe(true);
    expect(isValidUtf8(bytes(0xe1, 0x80, 0x80))).toBe(true);
    expect(isValidUtf8(bytes(0xec, 0xbf, 0xbf))).toBe(true);
    expect(isValidUtf8(bytes(0xed, 0x80, 0x80))).toBe(true);
    expect(isValidUtf8(bytes(0xed, 0x9f, 0xbf))).toBe(true);
    expect(isValidUtf8(bytes(0xee, 0x80, 0x80))).toBe(true);
    expect(isValidUtf8(bytes(0xef, 0xbf, 0xbf))).toBe(true);
  });

  it("rejects invalid three-byte E0 continuations and surrogate encodings", () => {
    expect(isValidUtf8(bytes(0xe0, 0x80, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xe0, 0xc0, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xe0, 0xa0))).toBe(false);
    expect(isValidUtf8(bytes(0xed, 0xa0, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xed, 0x9f, 0xc0))).toBe(false);
    expect(isValidUtf8(bytes(0xe1, 0x7f, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xee, 0x80))).toBe(false);
  });

  it("accepts valid four-byte sequences at boundary code points", () => {
    expect(isValidUtf8(bytes(0xf0, 0x90, 0x80, 0x80))).toBe(true);
    expect(isValidUtf8(bytes(0xf1, 0x80, 0x80, 0x80))).toBe(true);
    expect(isValidUtf8(bytes(0xf3, 0xbf, 0xbf, 0xbf))).toBe(true);
    expect(isValidUtf8(bytes(0xf4, 0x80, 0x80, 0x80))).toBe(true);
    expect(isValidUtf8(bytes(0xf4, 0x8f, 0xbf, 0xbf))).toBe(true);
  });

  it("rejects invalid four-byte sequences and code points above U+10FFFF", () => {
    expect(isValidUtf8(bytes(0xf0, 0x80, 0x80, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xf0, 0xc0, 0x80, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xf0, 0x90, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xf4, 0x90, 0x80, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xf4, 0x8f, 0xbf, 0xc0))).toBe(false);
    expect(isValidUtf8(bytes(0xf5, 0x80, 0x80, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xf7, 0x80, 0x80, 0x80))).toBe(false);
  });

  it("rejects lone continuation bytes and invalid lead bytes", () => {
    expect(isValidUtf8(bytes(0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xbf))).toBe(false);
    expect(isValidUtf8(bytes(0xfe, 0xff))).toBe(false);
    expect(isValidUtf8(bytes(0xff))).toBe(false);
  });

  it("accepts mixed valid sequences including emoji and rejects when a later sequence is invalid", () => {
    const smiley = new TextEncoder().encode("a\u0080\u{1F600}z");
    expect(isValidUtf8(smiley)).toBe(true);

    const brokenTail = Uint8Array.from([...smiley, 0xc2]);
    expect(isValidUtf8(brokenTail)).toBe(false);
  });

  it("rejects sequences whose continuation bytes would extend past the buffer", () => {
    expect(isValidUtf8(bytes(0xf0, 0x90, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xf1, 0x80, 0x80))).toBe(false);
    expect(isValidUtf8(bytes(0xe0, 0xa0))).toBe(false);
  });
});
