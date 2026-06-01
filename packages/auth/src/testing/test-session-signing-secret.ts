import { createHash } from "node:crypto";

/** Public fixture label; derived bytes are for unit tests only. */
const TEST_SESSION_SIGNING_SEED = "insecur:auth:ephemeral-session-signing:v1";

/** Deterministic HMAC signing material for auth package tests (not a production secret). */
export function testSessionSigningSecret(): string {
  return createHash("sha256").update(TEST_SESSION_SIGNING_SEED).digest("hex");
}
