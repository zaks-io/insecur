import { CREDENTIAL_SCOPES } from "@insecur/access";
import { environmentId, machineIdentityId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { mintMachineAccessToken, verifyMachineAccessToken } from "../src/machine-access-token.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const SECRET = "test-machine-access-signing-secret";

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
    const parts = minted.accessToken.split(".");
    const header = parts[0];
    const body = parts[1];
    const signature = parts[2];
    if (header === undefined || body === undefined || signature === undefined) {
      throw new Error("expected signed token with three segments");
    }
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    payload.typ = "wrong_typ";
    const tamperedBody = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const verified = await verifyMachineAccessToken(
      `${header}.${tamperedBody}.${signature}`,
      SECRET,
    );
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
    const parts = minted.accessToken.split(".");
    const header = parts[0];
    const body = parts[1];
    const signature = parts[2];
    if (header === undefined || body === undefined || signature === undefined) {
      throw new Error("expected signed token with three segments");
    }
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const tamperedBody = Buffer.from(JSON.stringify({ ...payload, ...override })).toString(
      "base64url",
    );
    const verified = await verifyMachineAccessToken(
      `${header}.${tamperedBody}.${signature}`,
      SECRET,
    );
    expect(verified).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects non-object payload bodies", async () => {
    const minted = await mintMachineAccessToken({
      machineIdentityId: MACHINE,
      organizationId: ORG,
      projectId: PROJECT,
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      signingSecret: SECRET,
      ttlSeconds: 60,
    });
    const [header, , signature] = minted.accessToken.split(".");
    const arrayBody = Buffer.from(JSON.stringify(["not", "object"])).toString("base64url");
    const verified = await verifyMachineAccessToken(`${header}.${arrayBody}.${signature}`, SECRET);
    expect(verified).toEqual({ ok: false, reason: "invalid" });
  });
});
