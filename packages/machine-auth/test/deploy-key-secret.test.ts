import { describe, expect, it } from "vitest";
import { hashDeployKeySecret, verifyDeployKeySecret } from "../src/deploy-key-secret.js";
import { createDeployKeyTestSecret } from "./helpers/deploy-key-test-secret.js";

describe("deploy-key-secret", () => {
  it("hashes and verifies deploy key secrets without storing plaintext", () => {
    const secret = createDeployKeyTestSecret();
    const verifier = hashDeployKeySecret(secret);

    expect(verifyDeployKeySecret(secret, verifier)).toBe(true);
    expect(verifyDeployKeySecret(createDeployKeyTestSecret(), verifier)).toBe(false);
  });
});
