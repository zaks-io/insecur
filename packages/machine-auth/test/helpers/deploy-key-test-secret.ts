import { randomBytes } from "node:crypto";

/** Runtime-only deploy key secret for tests; never commit or log the returned value. */
export function createDeployKeyTestSecret(): string {
  return randomBytes(32).toString("hex");
}
