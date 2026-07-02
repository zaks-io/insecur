import {
  assertOrganizationMembership,
  authorizeScopeOrThrow,
  AUTHORIZATION_SCOPES,
} from "@insecur/access";
import { captureFirstValueFeedback } from "@insecur/audit";
import type { UserActor } from "@insecur/auth";
import {
  AUTH_ERROR_CODES,
  environmentId,
  injectionGrantId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import {
  assertRuntimeInjectionAccess,
  InjectionGrantError,
} from "@insecur/runtime-injection-issue";
import { TenantInjectionGrantStore, withTenantScope } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureFirstValueFeedbackRpcInput } from "@insecur/worker-kit";

import { captureFirstValueFeedbackOperation } from "./capture-first-value-feedback-operation.js";
import type { RuntimeRpcActorContext } from "../rpc/runtime-rpc-entry.js";

const mockGetGrant = vi.fn();

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    assertOrganizationMembership: vi.fn(),
    authorizeScopeOrThrow: vi.fn(),
  };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    captureFirstValueFeedback: vi.fn(),
  };
});

vi.mock("@insecur/runtime-injection-issue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/runtime-injection-issue")>();
  return {
    ...actual,
    assertRuntimeInjectionAccess: vi.fn(),
  };
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
    TenantInjectionGrantStore: vi.fn(function TenantInjectionGrantStoreMock() {
      return {
        getGrant: mockGetGrant,
      };
    }),
  };
});

const organization = organizationId.generate();
const grant = injectionGrantId.generate();
const actorUser = userId.generate();
const hopRequestId = requestId.generate();
const userActor: UserActor = {
  type: "user",
  userId: actorUser,
  sessionId: "session_test",
  workosUserId: "user_test",
};
const actors: RuntimeRpcActorContext = {
  actor: userActor,
  auditActor: { type: "user", userId: actorUser },
  accessActor: { type: "user", userId: actorUser },
};

const grantInput: CaptureFirstValueFeedbackRpcInput = {
  organizationId: organization,
  feedbackKind: "feedback.kind.praise",
  noteCode: "feedback.note.praise_loop",
  actorToken: "verified-by-rpc-entry",
  requestId: hopRequestId,
  grantId: grant,
};

function grantRow() {
  return {
    project_id: projectId.brand("prj_00000000000000000000000001"),
    environment_id: environmentId.brand("env_00000000000000000000000001"),
  };
}

function mockTenantScopeWithAuditEvidence(): void {
  vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) => {
    const sql = vi.fn(async () => [{ id: "aud_test" }]);
    return fn({ sql, db: {} } as never);
  });
}

describe("captureFirstValueFeedbackOperation", () => {
  beforeEach(() => {
    vi.mocked(assertOrganizationMembership).mockReset();
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(captureFirstValueFeedback).mockReset();
    vi.mocked(withTenantScope).mockReset();
    vi.mocked(assertRuntimeInjectionAccess).mockReset();
    vi.mocked(TenantInjectionGrantStore).mockClear();
    mockGetGrant.mockReset();
    vi.mocked(assertOrganizationMembership).mockResolvedValue(undefined);
    vi.mocked(authorizeScopeOrThrow).mockResolvedValue(undefined);
    vi.mocked(captureFirstValueFeedback).mockResolvedValue({ feedbackId: "fvb_test" });
    mockTenantScopeWithAuditEvidence();
  });

  it("checks organization membership before persisting feedback", async () => {
    const events: string[] = [];
    vi.mocked(assertOrganizationMembership).mockImplementation(async () => {
      events.push("membership");
    });
    vi.mocked(authorizeScopeOrThrow).mockImplementation(async () => {
      events.push("org-read");
    });
    vi.mocked(captureFirstValueFeedback).mockImplementation(async () => {
      events.push("capture");
      return { feedbackId: "fvb_test" };
    });

    const associatedRequestId = requestId.generate();
    const input: CaptureFirstValueFeedbackRpcInput = {
      organizationId: organization,
      feedbackKind: "feedback.kind.praise",
      noteCode: "feedback.note.praise_loop",
      actorToken: "verified-by-rpc-entry",
      requestId: hopRequestId,
      associatedRequestId,
    };

    await expect(captureFirstValueFeedbackOperation(input, actors)).resolves.toEqual({
      feedbackId: "fvb_test",
    });

    expect(events).toEqual(["membership", "org-read", "capture"]);
    expect(assertOrganizationMembership).toHaveBeenCalledWith(actors.accessActor, organization);
    expect(authorizeScopeOrThrow).toHaveBeenCalledWith({
      actor: actors.accessActor,
      auditActor: actors.auditActor,
      coordinate: { organizationId: organization },
      requiredScope: AUTHORIZATION_SCOPES.organizationRead,
      requestId: hopRequestId,
    });
  });

  it("does not require organization read when feedback is grant-associated only", async () => {
    mockGetGrant.mockResolvedValue(null);

    await expect(captureFirstValueFeedbackOperation(grantInput, actors)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
    expect(authorizeScopeOrThrow).not.toHaveBeenCalled();
    expect(assertRuntimeInjectionAccess).not.toHaveBeenCalled();
  });

  it("returns the same code for missing grant and present grant without consume scope", async () => {
    vi.mocked(assertRuntimeInjectionAccess).mockRejectedValue(
      new InjectionGrantError(
        AUTH_ERROR_CODES.insufficientScope,
        "runtime injection scope required",
      ),
    );
    mockGetGrant.mockResolvedValue(grantRow());
    const presentNoScope = await captureFirstValueFeedbackOperation(grantInput, actors).catch(
      (error: { code?: string }) => error.code,
    );

    mockGetGrant.mockResolvedValue(null);
    const missingGrant = await captureFirstValueFeedbackOperation(grantInput, actors).catch(
      (error: { code?: string }) => error.code,
    );

    expect(presentNoScope).toBe(AUTH_ERROR_CODES.insufficientScope);
    expect(missingGrant).toBe(AUTH_ERROR_CODES.insufficientScope);
  });
});
