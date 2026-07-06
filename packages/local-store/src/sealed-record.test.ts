import { describe, expect, it } from "vitest";

import { KeyStoreError } from "./errors.js";
import { generateMachineRootKeyHex } from "./machine-root-key.js";
import { SEALED_RECORD_V1_PREFIX, sealLocalRecord, unsealLocalRecord } from "./sealed-record.js";

const keyHex = generateMachineRootKeyHex();

describe("sealed local records", () => {
  it("round-trips utf8 plaintext", () => {
    const plaintext = JSON.stringify({ credential: "tok_secret", note: "ünïcode ✓" });
    const sealed = sealLocalRecord(keyHex, plaintext);
    expect(sealed.startsWith(`${SEALED_RECORD_V1_PREFIX}:`)).toBe(true);
    expect(sealed).not.toContain("tok_secret");
    expect(unsealLocalRecord(keyHex, sealed)).toBe(plaintext);
  });

  it("produces distinct ciphertexts per seal", () => {
    expect(sealLocalRecord(keyHex, "same")).not.toBe(sealLocalRecord(keyHex, "same"));
  });

  it("rejects a tampered ciphertext", () => {
    const sealed = sealLocalRecord(keyHex, "payload");
    const parts = sealed.split(":");
    const body = Buffer.from(parts[3] ?? "", "base64");
    if (body.length > 0) {
      const first = body[0] ?? 0;
      body[0] = first ^ 0xff;
    }
    parts[3] = body.toString("base64");
    expect(() => unsealLocalRecord(keyHex, parts.join(":"))).toThrow(KeyStoreError);
  });

  it("rejects the wrong key", () => {
    const sealed = sealLocalRecord(keyHex, "payload");
    expect(() => unsealLocalRecord(generateMachineRootKeyHex(), sealed)).toThrow(KeyStoreError);
  });

  it("rejects malformed sealed strings", () => {
    expect(() => unsealLocalRecord(keyHex, "not-a-sealed-record")).toThrow(KeyStoreError);
    expect(() => unsealLocalRecord(keyHex, `${SEALED_RECORD_V1_PREFIX}:a:b`)).toThrow(
      KeyStoreError,
    );
  });

  it("rejects invalid key material", () => {
    expect(() => sealLocalRecord("deadbeef", "payload")).toThrow(KeyStoreError);
  });
});
