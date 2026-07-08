import { describe, expect, it } from "vitest";

import { isSecretSyncKind, SECRET_SYNC_KINDS } from "../src/secret-sync-kinds.js";

describe("secret sync kinds", () => {
  it("recognizes supported secret sync kinds", () => {
    expect(isSecretSyncKind(SECRET_SYNC_KINDS.githubActions)).toBe(true);
    expect(isSecretSyncKind("vercel-env")).toBe(false);
  });
});
