import { describe, expect, it } from "vitest";

import {
  assertMachineRootKeyHex,
  bytesToMachineRootKeyHex,
  generateMachineRootKeyHex,
} from "./machine-root-key.js";
import { KEY_STORE_ERROR_CODES, KeyStoreError } from "./errors.js";

const FAKE_KEY_HEX = "ab".repeat(32);

describe("machine root key material", () => {
  it("accepts 64-char hex keys", () => {
    expect(assertMachineRootKeyHex(FAKE_KEY_HEX)).toBe(FAKE_KEY_HEX);
    expect(assertMachineRootKeyHex(FAKE_KEY_HEX.toUpperCase())).toBe(FAKE_KEY_HEX);
  });

  it("rejects invalid key material without echoing the value", () => {
    expect(() => {
      assertMachineRootKeyHex("too-short");
    }).toThrow(KeyStoreError);

    try {
      assertMachineRootKeyHex("zz".repeat(32));
    } catch (error) {
      expect(error).toBeInstanceOf(KeyStoreError);
      expect((error as KeyStoreError).code).toBe(KEY_STORE_ERROR_CODES.invalidMaterial);
      expect((error as Error).message).not.toContain("zz");
    }
  });

  it("generates 64-char hex from 32 random bytes", () => {
    const bytes = new Uint8Array(32).fill(0xcd);
    expect(generateMachineRootKeyHex(() => bytes)).toBe("cd".repeat(32));
    expect(bytesToMachineRootKeyHex(bytes)).toBe("cd".repeat(32));
  });

  it("rejects byte buffers with the wrong length", () => {
    expect(() => {
      bytesToMachineRootKeyHex(new Uint8Array(16));
    }).toThrow(KeyStoreError);
  });
});
