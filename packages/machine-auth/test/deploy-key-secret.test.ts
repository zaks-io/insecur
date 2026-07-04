import { describe, expect, it } from "vitest";
import { hashDeployKeySecret, verifyDeployKeySecret } from "../src/deploy-key-secret.js";

describe("deploy-key-secret", () => {
  it("hashes and verifies deploy key secrets without storing plaintext", () => {
    const secret = "insecur-deploy-key-secret-material";
    const verifier = hashDeployKeySecret(secret);

    expect(verifyDeployKeySecret(secret, verifier)).toBe(true);
    expect(verifyDeployKeySecret("other-secret", verifier)).toBe(false);
  });
});
