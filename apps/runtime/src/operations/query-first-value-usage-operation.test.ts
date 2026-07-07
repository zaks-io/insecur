import { authorizeScopeOrThrow } from "@insecur/access";
import { AUTH_ERROR_CODES, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  queryFirstValueUsageOperation,
  type QueryFirstValueUsageOperationInput,
} from "./query-first-value-usage-operation.js";

vi.mock("@insecur/audit", () => ({
  queryFirstValueUsageEvidence: vi.fn(async () => ({
    organizationId: "org_test",
    window: { startInclusive: new Date(), endExclusive: new Date() },
    counts: {
      guidedProvisioned: 0,
      secretWrites: 2,
      grantIssued: 1,
      grantConsumed: 1,
      runCompleted: 0,
      deniedAttempts: 0,
    },
    distinctRunActors: 0,
    repeatedRunUsage: false,
  })),
}));

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    authorizeScopeOrThrow: vi.fn(async () => undefined),
  };
});

describe("queryFirstValueUsageOperation", () => {
  const actor: QueryFirstValueUsageOperationInput["auditActor"] = {
    type: "user",
    userId: userId.generate(),
  };
  const accessActor: QueryFirstValueUsageOperationInput["accessActor"] = {
    type: "user",
    userId: actor.userId,
  };

  it("returns metadata-only counters and firstInjectionObserved", async () => {
    const result = await queryFirstValueUsageOperation({
      input: {
        organizationId: "org_00000000000000000000000001" as never,
        requestId: "req_00000000000000000000000001" as never,
        actorToken: "token",
      },
      auditActor: actor,
      accessActor,
    });

    expect(result).toEqual({
      secretWrites: 2,
      grantConsumed: 1,
      runCompleted: 0,
      firstInjectionObserved: true,
    });
    expect(JSON.stringify(result)).not.toMatch(/hunter2|secret-value/i);
  });
});

describe("queryFirstValueUsageOperation denial", () => {
  const actor: QueryFirstValueUsageOperationInput["auditActor"] = {
    type: "user",
    userId: userId.generate(),
  };
  const accessActor: QueryFirstValueUsageOperationInput["accessActor"] = {
    type: "user",
    userId: actor.userId,
  };

  beforeEach(() => {
    vi.mocked(authorizeScopeOrThrow).mockReset();
  });

  it("propagates authorization failures from authorizeScopeOrThrow", async () => {
    vi.mocked(authorizeScopeOrThrow).mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: AUTH_ERROR_CODES.insufficientScope }),
    );

    await expect(
      queryFirstValueUsageOperation({
        input: {
          organizationId: "org_00000000000000000000000001" as never,
          requestId: "req_00000000000000000000000001" as never,
          actorToken: "token",
        },
        auditActor: actor,
        accessActor,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });
});
