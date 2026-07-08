import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import { AUTH_ERROR_CODES, organizationId, userId, type KnownErrorCode } from "@insecur/domain";
import type { RuntimeRpcResult, ExportTenantAuditRpcPayload } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createRuntimeRpcStub,
  type RuntimeRpcStub,
} from "../../../test/support/runtime-rpc-stub.js";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../../../test/support/setup-unit-auth.js";

import app from "../../index.js";

const admittedUserId = userId.brand(ADMITTED_USER_ID_RAW);
const workosUserId = WORKOS_USER_ID;
const orgId = organizationId.brand("org_00000000000000000000000011");

let runtime: RuntimeRpcStub;

function makeEnv() {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    INSTANCE_ID: "inst_LOCAL_DEV",
    RUNTIME_TOKEN_SIGNING_SECRET: "runtime-hop-secret-00000000000000000000000000",
    RUNTIME: runtime,
  };
}

const auditExportPath = `/v1/orgs/${orgId}/audit-export`;

const metadataOnlyExport: ExportTenantAuditRpcPayload = {
  jsonl: "",
  manifest: {
    schema_version: "1",
    organization_id: orgId,
    time_range: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-02T00:00:00.000Z",
    },
    entry_count: 0,
    first_hash: null,
    last_hash: null,
    hash_algorithm: "SHA-256",
    hmac_key_version: 1,
    signing_key_version: 1,
    hmac: "hmac_test",
    signature: "signature_test",
    signature_algorithm: "Ed25519",
    custody_evidence_refs: {
      hmac: "escrow-record://instance/test/audit-hmac/v1",
      signing: "escrow-record://instance/test/audit-signing/v1",
    },
  },
};

function rpcFailure(
  code: KnownErrorCode,
  message: string,
  retryable = false,
): RuntimeRpcResult<never> {
  return { ok: false, error: { code, message, retryable } };
}

async function authHeaders(env: ReturnType<typeof makeEnv>): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_audit_export_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

describe("audit export worker routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.exportTenantAudit.mockResolvedValue({
      ok: true,
      value: metadataOnlyExport,
    });
  });

  it("returns auth.required when unauthenticated", async () => {
    const env = makeEnv();
    const response = await app.request(
      `${auditExportPath}?from=2026-07-01T00:00:00.000Z&to=2026-07-02T00:00:00.000Z`,
      { method: "GET" },
      env,
    );

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "auth.required" } });
    expect(runtime.exportTenantAudit).not.toHaveBeenCalled();
  });

  it("forwards the time range to the Runtime Worker", async () => {
    const env = makeEnv();
    const response = await app.request(
      `${auditExportPath}?from=2026-07-01T00:00:00.000Z&to=2026-07-02T00:00:00.000Z`,
      { method: "GET", headers: await authHeaders(env) },
      env,
    );

    expect(response.status).toBe(200);
    expect(runtime.exportTenantAudit).toHaveBeenCalledTimes(1);
    const forwarded = runtime.exportTenantAudit.mock.calls[0]?.[0];
    expect(forwarded?.organizationId).toBe(orgId);
    expect(forwarded?.from).toBe("2026-07-01T00:00:00.000Z");
    expect(forwarded?.to).toBe("2026-07-02T00:00:00.000Z");
    expect(forwarded?.actorToken.length).toBeGreaterThan(0);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: true, data: metadataOnlyExport });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/valueUtf8|plaintext|password|secret-value/i);
  });

  it("maps insufficient scope denials from the Runtime Worker", async () => {
    const env = makeEnv();
    runtime.exportTenantAudit.mockResolvedValue(
      rpcFailure(AUTH_ERROR_CODES.insufficientScope, "Missing required permission."),
    );

    const response = await app.request(
      `${auditExportPath}?from=2026-07-01T00:00:00.000Z&to=2026-07-02T00:00:00.000Z`,
      { method: "GET", headers: await authHeaders(env) },
      env,
    );

    expect(response.status).toBe(403);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: AUTH_ERROR_CODES.insufficientScope },
    });
  });
});
