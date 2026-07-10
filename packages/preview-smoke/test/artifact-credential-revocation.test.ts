import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { revokeSmokeCredentials } from "../src/artifact-credential-revocation";

function fakeHmacCredential(claims: { exp: number }): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return `fake-header.${payload}.fake-signature`;
}

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

  it("treats an already-expired fake credential as revoked without calling the API", async () => {
    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      fetchCalls += 1;
      return Promise.resolve(new Response(JSON.stringify({ data: { revoked: false }, ok: true })));
    };

    try {
      await revokeSmokeCredentials("https://api.preview.example", [
        fakeHmacCredential({ exp: Math.floor(Date.now() / 1000) - 60 }),
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchCalls).toBe(0);
  });

  it("still fails when a not-yet-expired fake credential is not confirmed revoked", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(new Response(JSON.stringify({ data: { revoked: false }, ok: true })));

    try {
      await expect(
        revokeSmokeCredentials("https://api.preview.example", [
          fakeHmacCredential({ exp: Math.floor(Date.now() / 1000) + 600 }),
        ]),
      ).rejects.toThrow("Preview smoke credential revocation was not confirmed");
    } finally {
      globalThis.fetch = originalFetch;
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
