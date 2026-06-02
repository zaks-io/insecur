import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashBootstrapSecret, verifyBootstrapSecret } from "../src/bootstrap-secret.js";

describe("bootstrap secret verifier", () => {
  it("accepts a matching secret and rejects a different secret", () => {
    const secret = randomBytes(32).toString("base64url");
    const other = randomBytes(32).toString("base64url");
    const verifier = hashBootstrapSecret(secret);

    expect(verifyBootstrapSecret(secret, verifier)).toBe(true);
    expect(verifyBootstrapSecret(other, verifier)).toBe(false);
  });
});
