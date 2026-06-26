import { bytesToBase64Url } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";
import {
  encodeUnsignedJwtPayload,
  importRs256PublicKeyFromJwk,
  verifyRs256Jwt,
} from "../src/rs256-jwt.js";
import { createTestGitHubActionsOidcSigner } from "../src/testing/sign-github-actions-oidc.js";

describe("verifyRs256Jwt", () => {
  it("verifies a valid RS256 JWT and returns the payload", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const token = await signer.sign({
      sub: "repo:org/repo:ref:refs/heads/main",
      exp: 9_999_999_999,
    });

    const keys = await signer.jwks.getVerificationKeys();
    const verified = await verifyRs256Jwt(token, keys);

    expect(verified).toEqual({
      ok: true,
      payload: { sub: "repo:org/repo:ref:refs/heads/main", exp: 9_999_999_999 },
    });
  });

  it("rejects tokens without three segments", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const keys = await signer.jwks.getVerificationKeys();

    expect(await verifyRs256Jwt("", keys)).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyRs256Jwt("only-one", keys)).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyRs256Jwt("a.b", keys)).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyRs256Jwt("a.b.c.d", keys)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects malformed header JSON", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const keys = await signer.jwks.getVerificationKeys();
    const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ exp: 9_999 })));

    expect(await verifyRs256Jwt(`not-json.${body}.sig`, keys)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects headers without alg", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const keys = await signer.jwks.getVerificationKeys();
    const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ typ: "JWT" })));
    const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ exp: 9_999 })));

    expect(await verifyRs256Jwt(`${header}.${body}.sig`, keys)).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects unsupported algorithms and missing kid", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const keys = await signer.jwks.getVerificationKeys();
    const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ exp: 9_999 })));
    const hs256Header = bytesToBase64Url(
      new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT", kid: signer.kid })),
    );
    const missingKidHeader = bytesToBase64Url(
      new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    );

    expect(await verifyRs256Jwt(`${hs256Header}.${body}.sig`, keys)).toEqual({
      ok: false,
      reason: "unsupported_alg",
    });
    expect(await verifyRs256Jwt(`${missingKidHeader}.${body}.sig`, keys)).toEqual({
      ok: false,
      reason: "unsupported_alg",
    });
  });

  it("rejects unknown kid and invalid signatures", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const keys = await signer.jwks.getVerificationKeys();
    const token = await signer.sign({ exp: 9_999_999_999 });
    const [header, body] = token.split(".");

    const unknownKidHeader = bytesToBase64Url(
      new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "unknown-kid" })),
    );
    expect(await verifyRs256Jwt(`${unknownKidHeader}.${body}.invalid`, keys)).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
    expect(await verifyRs256Jwt(`${header}.${body}.!!!`, keys)).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("rejects tampered payload segments after signature verification", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const keys = await signer.jwks.getVerificationKeys();
    const token = await signer.sign({ exp: 9_999_999_999 });
    const [header, , signature] = token.split(".");
    const tamperedBody = bytesToBase64Url(
      new TextEncoder().encode(JSON.stringify({ exp: 9_999_999_998 })),
    );

    expect(await verifyRs256Jwt(`${header}.${tamperedBody}.${signature}`, keys)).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("rejects non-object payload JSON", async () => {
    const signer = await createTestGitHubActionsOidcSigner();
    const keys = await signer.jwks.getVerificationKeys();
    const arraySigned = await signer.sign(["not", "object"] as unknown as Record<string, unknown>);

    expect(await verifyRs256Jwt(arraySigned, keys)).toEqual({
      ok: false,
      reason: "invalid_payload",
    });
  });
});

describe("importRs256PublicKeyFromJwk", () => {
  it("imports RSA public keys with kid", async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const exported = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as Record<
      string,
      unknown
    >;

    const imported = await importRs256PublicKeyFromJwk({ ...exported, kid: "test-kid" });
    expect(imported).not.toBeNull();
    if (imported === null) {
      throw new Error("expected imported RSA public key");
    }
    expect(imported.kid).toBe("test-kid");
    expect(imported.alg).toBe("RS256");

    const claims = { sub: "imported-key-check", exp: 9_999_999_999 };
    const header = bytesToBase64Url(
      new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-kid" })),
    );
    const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
    const signingInput = `${header}.${body}`;
    const signature = await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    );
    const token = `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;

    expect(await verifyRs256Jwt(token, [imported])).toEqual({ ok: true, payload: claims });
  });

  it("rejects JWK documents missing required RSA fields", async () => {
    expect(await importRs256PublicKeyFromJwk({ kid: "k1", kty: "RSA" })).toBeNull();
    expect(await importRs256PublicKeyFromJwk({ kty: "RSA", n: "abc", e: "AQAB" })).toBeNull();
    expect(
      await importRs256PublicKeyFromJwk({ kid: "k1", kty: "EC", n: "abc", e: "AQAB" }),
    ).toBeNull();
    expect(
      await importRs256PublicKeyFromJwk({ kid: "k1", kty: "RSA", n: 123, e: "AQAB" }),
    ).toBeNull();
  });

  it("returns null when importKey throws", async () => {
    const spy = vi
      .spyOn(crypto.subtle, "importKey")
      .mockRejectedValueOnce(new Error("import failed"));
    const imported = await importRs256PublicKeyFromJwk({
      kid: "bad-key",
      kty: "RSA",
      n: "abc",
      e: "AQAB",
    });
    expect(imported).toBeNull();
    spy.mockRestore();
  });
});

describe("encodeUnsignedJwtPayload", () => {
  it("encodes header and payload segments without a signature", () => {
    const encoded = encodeUnsignedJwtPayload({ sub: "actor", exp: 123 });
    const parts = encoded.split(".");
    const header = parts[0];
    const body = parts[1];
    expect(header).toBeTruthy();
    expect(body).toBeTruthy();
    expect(parts).toHaveLength(2);
    if (header === undefined) {
      throw new Error("expected encoded JWT header");
    }

    const headerJson = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(header.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
      ),
    );
    expect(headerJson).toEqual({ alg: "RS256", typ: "JWT" });
  });
});
