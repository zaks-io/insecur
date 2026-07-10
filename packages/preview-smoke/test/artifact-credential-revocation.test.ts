import { describe, expect, it } from "vitest";

import { revokeSmokeCredentials } from "../src/artifact-credential-revocation";

describe("preview smoke credential revocation", () => {
  it("revokes each fake credential through the self-revocation endpoint", async () => {
    const requests: Request[] = [];
    const fetchStub: typeof fetch = (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(new Response(JSON.stringify({ data: { revoked: true }, ok: true })));
    };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchStub;

    try {
      await revokeSmokeCredentials("https://api.preview.example", [
        "fake-preview-smoke-credential-a",
        "fake-preview-smoke-credential-b",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(request.url).toBe("https://api.preview.example/v1/session/revoke");
      expect(request.headers.get("authorization")).toMatch(
        /^Bearer fake-preview-smoke-credential-/u,
      );
    }
  });

  it("fails without exposing the fake credential when revocation is unconfirmed", async () => {
    const credential = "fake-preview-smoke-credential-not-revoked";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(new Response(JSON.stringify({ data: { revoked: false }, ok: true })));

    try {
      await expect(
        revokeSmokeCredentials("https://api.preview.example", [credential]),
      ).rejects.toThrow("Preview smoke credential revocation was not confirmed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
