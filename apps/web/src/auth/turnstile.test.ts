import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readTurnstileToken,
  turnstileSiteKey,
  verifyTurnstileToken,
  TURNSTILE_RESPONSE_FIELD,
} from "./turnstile.js";
import type { WebEnv } from "../env.js";

const env = {
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
} as WebEnv;

function request(host = "app.insecur.cloud") {
  return new Request(`https://${host}/login`, {
    headers: { "CF-Connecting-IP": "203.0.113.10" },
  });
}

describe("turnstileSiteKey", () => {
  it("returns the configured public site key", () => {
    expect(turnstileSiteKey(env)).toBe("1x00000000000000000000AA");
  });

  it("throws when the public site key is missing", () => {
    expect(() => turnstileSiteKey({ ...env, TURNSTILE_SITE_KEY: "" })).toThrow(
      /TURNSTILE_SITE_KEY/,
    );
  });
});

describe("readTurnstileToken", () => {
  it("reads the widget response token from form data", () => {
    const formData = new FormData();
    formData.set(TURNSTILE_RESPONSE_FIELD, " token ");

    expect(readTurnstileToken(formData)).toBe("token");
  });

  it("rejects missing and oversized tokens", () => {
    expect(readTurnstileToken(new FormData())).toBeNull();

    const formData = new FormData();
    formData.set(TURNSTILE_RESPONSE_FIELD, "x".repeat(2049));
    expect(readTurnstileToken(formData)).toBeNull();
  });
});

describe("verifyTurnstileToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts a token minted for the production hostname and posts it to Siteverify", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        success: true,
        action: "web-login",
        hostname: "app.insecur.cloud",
        "error-codes": [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken(request(), env, "token");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const firstCall = fetchMock.mock.calls[0];
    if (firstCall === undefined || firstCall[1] === undefined) {
      throw new Error("expected Siteverify fetch call");
    }
    const body = JSON.parse(firstCall[1].body as string) as Record<string, string>;
    expect(body).toMatchObject({
      secret: env.TURNSTILE_SECRET_KEY,
      response: "token",
      remoteip: "203.0.113.10",
    });
    expect(body.idempotency_key).toHaveLength(36);
  });

  it("accepts a token minted for the preview hostname", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          action: "web-login",
          hostname: "app.preview.insecur.cloud",
        }),
      ),
    );

    await expect(
      verifyTurnstileToken(request("app.preview.insecur.cloud"), env, "token"),
    ).resolves.toEqual({ ok: true });
  });

  it("accepts a token minted for a local development request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ success: true, action: "web-login", hostname: "localhost" }),
      ),
    );

    await expect(verifyTurnstileToken(request("localhost:8788"), env, "token")).resolves.toEqual({
      ok: true,
    });
  });

  it("fails closed when Siteverify rejects or the action mismatches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: false })),
    );
    await expect(verifyTurnstileToken(request(), env, "token")).resolves.toEqual({
      ok: false,
      reason: "rejected",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ success: true, action: "other", hostname: "app.insecur.cloud" }),
      ),
    );
    await expect(verifyTurnstileToken(request(), env, "token")).resolves.toEqual({
      ok: false,
      reason: "invalid_token",
    });
  });

  it.each([
    ["does not match the request", "app.preview.insecur.cloud"],
    ["is missing", undefined],
    ["is malformed", 42],
  ])("fails closed when the Siteverify hostname %s", async (_description, hostname) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ success: true, action: "web-login", hostname })),
    );

    await expect(verifyTurnstileToken(request(), env, "token")).resolves.toEqual({
      ok: false,
      reason: "invalid_token",
    });
  });

  it("fails closed when Siteverify is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(verifyTurnstileToken(request(), env, "token")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await expect(verifyTurnstileToken(request(), env, "token")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("fails closed when the token or secret is missing", async () => {
    await expect(verifyTurnstileToken(request(), env, null)).resolves.toEqual({
      ok: false,
      reason: "missing_token",
    });
    await expect(
      verifyTurnstileToken(request(), { ...env, TURNSTILE_SECRET_KEY: "" }, "token"),
    ).resolves.toEqual({
      ok: false,
      reason: "configuration",
    });
  });
});
