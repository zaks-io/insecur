import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  AUTH_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  injectionGrantId,
  operationId,
  organizationId,
  requestId,
  userId,
  type KnownErrorCode,
} from "@insecur/domain";
import type { RuntimeRpcResult } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createRuntimeRpcStub,
  type RuntimeRpcStub,
} from "../../../test/support/runtime-rpc-stub.js";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../../../test/support/setup-unit-auth.js";

import app from "../../index.js";

const admittedUserId = userId.brand(ADMITTED_USER_ID_RAW);
const workosUserId = WORKOS_USER_ID;
const orgId = organizationId.brand("org_00000000000000000000000001");
const grantIdValue = injectionGrantId.brand("igr_00000000000000000000000001");
const operationIdValue = operationId.brand("op_00000000000000000000000001");
const associatedRequestId = requestId.brand("req_00000000000000000000000001");

const feedbackPath = `/v1/orgs/${orgId}/design-partner-feedback`;

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
      sessionId: "session_feedback_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
    "Content-Type": "application/json",
  };
}

describe("design-partner feedback routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.captureFirstValueFeedback.mockResolvedValue({
      ok: true,
      value: { feedbackId: "fvb_00000000000000000000000001" },
    });
  });

  it("returns auth.required when unauthenticated", async () => {
    const env = makeEnv();
    const response = await app.request(
      feedbackPath,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedbackKind: "feedback.kind.praise",
          noteCode: "feedback.note.praise_loop",
          grantId: grantIdValue,
        }),
      },
      env,
    );

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: AUTH_ERROR_CODES.required } });
    expect(runtime.captureFirstValueFeedback).not.toHaveBeenCalled();
  });

  it("forwards metadata-only feedback to the Runtime Worker", async () => {
    const env = makeEnv();
    const response = await app.request(
      feedbackPath,
      {
        method: "POST",
        headers: await authHeaders(env),
        body: JSON.stringify({
          feedbackKind: "feedback.kind.blocker",
          noteCode: "feedback.note.cli_init_blocker",
          grantId: grantIdValue,
          operationId: operationIdValue,
          associatedRequestId,
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(runtime.captureFirstValueFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        feedbackKind: "feedback.kind.blocker",
        noteCode: "feedback.note.cli_init_blocker",
        grantId: grantIdValue,
        operationId: operationIdValue,
        associatedRequestId,
      }),
    );
    const forwarded = runtime.captureFirstValueFeedback.mock.calls[0]?.[0];
    expect(forwarded?.actorToken.length).toBeGreaterThan(0);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { feedbackId: "fvb_00000000000000000000000001" },
    });
  });

  it("maps invalid feedback note codes to HTTP 400", async () => {
    runtime.captureFirstValueFeedback.mockResolvedValue(
      rpcFailure(
        VALIDATION_ERROR_CODES.invalidFeedbackNoteCode,
        "validation.invalid_feedback_note_code",
      ),
    );

    const env = makeEnv();
    const response = await app.request(
      feedbackPath,
      {
        method: "POST",
        headers: await authHeaders(env),
        body: JSON.stringify({
          feedbackKind: "feedback.kind.friction",
          noteCode: "export API_KEY=hunter2",
          grantId: grantIdValue,
        }),
      },
      env,
    );

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: VALIDATION_ERROR_CODES.invalidFeedbackNoteCode },
    });
  });

  it("maps missing feedback associations to HTTP 404", async () => {
    runtime.captureFirstValueFeedback.mockResolvedValue(
      rpcFailure(
        VALIDATION_ERROR_CODES.feedbackAssociationNotFound,
        "validation.feedback_association_not_found",
      ),
    );

    const env = makeEnv();
    const response = await app.request(
      feedbackPath,
      {
        method: "POST",
        headers: await authHeaders(env),
        body: JSON.stringify({
          feedbackKind: "feedback.kind.suggestion",
          noteCode: "feedback.note.suggest_onboarding",
          operationId: operationIdValue,
        }),
      },
      env,
    );

    expect(response.status).toBe(404);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: VALIDATION_ERROR_CODES.feedbackAssociationNotFound },
    });
  });

  it.each(["missing grant", "present grant without consume scope"] as const)(
    "maps oracle-closed grant feedback denial (%s) to HTTP 403",
    async () => {
      runtime.captureFirstValueFeedback.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "runtime injection scope required"),
      );

      const env = makeEnv();
      const response = await app.request(
        feedbackPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({
            feedbackKind: "feedback.kind.praise",
            noteCode: "feedback.note.praise_loop",
            grantId: grantIdValue,
          }),
        },
        env,
      );

      expect(response.status).toBe(403);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.insufficientScope },
      });
    },
  );
});
