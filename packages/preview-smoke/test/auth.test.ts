import { Buffer } from "node:buffer";

import { userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { mintBearer, PREVIEW_SMOKE_SESSION_TTL_SECONDS } from "../src/auth";

describe("preview smoke bearer", () => {
  it("uses a smoke-only TTL instead of the normal CLI session lifetime", async () => {
    const bearer = await mintBearer({
      rawUserId: userId.generate(),
      sessionId: "session_preview_smoke_test",
      signingSecret: "preview-smoke-test-secret",
      workosUserId: "user_preview_smoke_test",
    });

    const payload = bearer.split(".")[1];
    if (payload === undefined) {
      throw new Error("Expected HMAC credential payload");
    }
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp: number;
      iat: number;
    };
    expect(claims.exp - claims.iat).toBe(PREVIEW_SMOKE_SESSION_TTL_SECONDS);
    expect(PREVIEW_SMOKE_SESSION_TTL_SECONDS).toBe(25 * 60);
  });
});
