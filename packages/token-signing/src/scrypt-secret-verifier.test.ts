import { describe, expect, it } from "vitest";
import { hashScryptSecret, verifyScryptSecret } from "./scrypt-secret-verifier.js";

describe("scrypt-secret-verifier", () => {
  it("hashes and verifies secrets with scrypt_v1", () => {
    const secret = "shared-secret-verifier-material";
    const verifier = hashScryptSecret(secret);

    expect(verifyScryptSecret(secret, verifier)).toBe(true);
    expect(verifyScryptSecret("other-secret", verifier)).toBe(false);
  });
});
