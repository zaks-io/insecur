import {
  assertOrganizationMembership,
  authorizeScopeOrThrow,
  AUTHORIZATION_SCOPES,
} from "@insecur/access";
import { captureFirstValueFeedback } from "@insecur/audit";
import type { UserActor } from "@insecur/auth";
import { injectionGrantId, organizationId, requestId, userId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CaptureFirstValueFeedbackRpcInput } from "@insecur/worker-kit";

import { captureFirstValueFeedbackOperation } from "./capture-first-value-feedback-operation.js";
import type { RuntimeRpcActorContext } from "../rpc/runtime-rpc-entry.js";

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
  };
});

const organization = organizationId.generate();
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
    const input: CaptureFirstValueFeedbackRpcInput = {
      organizationId: organization,
      feedbackKind: "feedback.kind.praise",
      noteCode: "feedback.note.praise_loop",
      actorToken: "verified-by-rpc-entry",
      requestId: hopRequestId,
      grantId: injectionGrantId.generate(),
    };

    await expect(captureFirstValueFeedbackOperation(input, actors)).rejects.toThrow();
    expect(authorizeScopeOrThrow).not.toHaveBeenCalled();
  });
});
