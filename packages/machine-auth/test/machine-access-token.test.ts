import { CREDENTIAL_SCOPES } from "@insecur/access";
import {
  bytesToBase64Url,
  environmentId,
  machineIdentityId,
  organizationId,
  projectId,
} from "@insecur/domain";
import {
  decodeSignedHs256PayloadBody,
  encodeSignedHs256Token,
  parseSignedHs256TokenParts,
} from "@insecur/token-signing";
import { describe, expect, it } from "vitest";
import { mintMachineAccessToken, verifyMachineAccessToken } from "../src/machine-access-token.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const SECRET = "test-machine-access-signing-secret";

function decodeMachineAccessPayload(accessToken: string): Record<string, unknown> {
  const parts = parseSignedHs256TokenParts(accessToken);
  if (parts === null) {
    throw new Error("expected signed token with three segments");
  }
  const payload = decodeSignedHs256PayloadBody(parts.body);
  if (payload === null) {
    throw new Error("expected object payload body");
  }
  return payload;
}

async function signMachineAccessPayload(
  payload: Record<string, unknown>,
  signingSecret: string,
): Promise<string> {
  return encodeSignedHs256Token(payload, signingSecret);
}

async function signNonObjectMachineAccessBody(
  bodySegment: string,
  signingSecret: string,
): Promise<string> {
  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const signingInput = `${header}.${bodySegment}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

describe("machine access token", () => {
  it("mints and verifies environment-scoped credentials", async () => {
    const minted = await mintMachineAccessToken({
      machineIdentityId: MACHINE,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      signingSecret: SECRET,
      ttlSeconds: 60,
    });

    const verified = await verifyMachineAccessToken(minted.accessToken, SECRET);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.token.machineIdentityId).toBe(MACHINE);
      expect(verified.token.environmentId).toBe(ENV);
      expect(verified.token.credentialScopes).toEqual([CREDENTIAL_SCOPES.runtimeInjectionRun]);
    }
  });

  it("rejects malformed token structure", async () => {
    const verified = await verifyMachineAccessToken("header.body", SECRET);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("invalid");
    }
  });

  it("rejects invalid base64url signature", async () => {
    const verified = await verifyMachineAccessToken("a.b.!", SECRET);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("invalid");
    }
  });

  it("rejects tampered tokens", async () => {
    const minted = await mintMachineAccessToken({
      machineIdentityId: MACHINE,
      organizationId: ORG,
      projectId: PROJECT,
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      signingSecret: SECRET,
      ttlSeconds: 60,
    });
    const verified = await verifyMachineAccessToken(`${minted.accessToken}x`, SECRET);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("invalid");
    }
  });

  it("rejects tokens signed with a different secret", async () => {
    const minted = await mintMachineAccessToken({
      machineIdentityId: MACHINE,
      organizationId: ORG,
      projectId: PROJECT,
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      signingSecret: SECRET,
      ttlSeconds: 60,
    });
    const verified = await verifyMachineAccessToken(minted.accessToken, `${SECRET}x`);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("invalid");
    }
  });

  it("rejects expired tokens", async () => {
    const minted = await mintMachineAccessToken({
      machineIdentityId: MACHINE,
      organizationId: ORG,
      projectId: PROJECT,
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      signingSecret: SECRET,
      ttlSeconds: -10,
    });
    const verified = await verifyMachineAccessToken(minted.accessToken, SECRET);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("expired");
    }
  });

  it("mints project-scoped credentials without environment", async () => {
    const minted = await mintMachineAccessToken({
      machineIdentityId: MACHINE,
      organizationId: ORG,
      projectId: PROJECT,
      credentialScopes: [
        CREDENTIAL_SCOPES.runtimeInjectionRun,
        CREDENTIAL_SCOPES.runtimeInjectionGrantIssue,
      ],
      signingSecret: SECRET,
      ttlSeconds: 60,
    });

    const verified = await verifyMachineAccessToken(minted.accessToken, SECRET);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.token.environmentId).toBeUndefined();
      expect(verified.token.credentialScopes).toEqual([
        CREDENTIAL_SCOPES.runtimeInjectionGrantIssue,
        CREDENTIAL_SCOPES.runtimeInjectionRun,
      ]);
    }
  });

  it("rejects tokens with wrong typ claim", async () => {
    const minted = await mintMachineAccessToken({
      machineIdentityId: MACHINE,
      organizationId: ORG,
      projectId: PROJECT,
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      signingSecret: SECRET,
      ttlSeconds: 60,
    });
    const payload = decodeMachineAccessPayload(minted.accessToken);
    const resigned = await signMachineAccessPayload({ ...payload, typ: "wrong_typ" }, SECRET);
    const verified = await verifyMachineAccessToken(resigned, SECRET);
    expect(verified).toEqual({ ok: false, reason: "invalid" });
  });

  it.each([
    { sub: 1 },
    { org: 1 },
    { prj: 1 },
    { scopes: "not-an-array" },
    { exp: "not-a-number" },
    { iat: "not-a-number" },
    { typ: "wrong_typ" },
  ])("rejects payloads missing machine access token core fields (%j)", async (override) => {
    const minted = await mintMachineAccessToken({
      machineIdentityId: MACHINE,
      organizationId: ORG,
      projectId: PROJECT,
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      signingSecret: SECRET,
      ttlSeconds: 60,
    });
    const payload = decodeMachineAccessPayload(minted.accessToken);
    const resigned = await signMachineAccessPayload({ ...payload, ...override }, SECRET);
    const verified = await verifyMachineAccessToken(resigned, SECRET);
    expect(verified).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects non-object payload bodies", async () => {
    const arrayBody = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(["not", "object"])));
    const resigned = await signNonObjectMachineAccessBody(arrayBody, SECRET);
    const verified = await verifyMachineAccessToken(resigned, SECRET);
    expect(verified).toEqual({ ok: false, reason: "invalid" });
  });
});
