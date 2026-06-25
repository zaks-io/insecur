import { resolveEffectiveAccess } from "@insecur/access";
import { auditActorUserId } from "@insecur/audit";
import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  environmentId,
  injectionGrantId,
  organizationId,
  projectId,
  userId,
  machineIdentityId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeConsumeInjectionGrant } from "../src/consume-injection-grant.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");
const ACTOR_USER = userId.brand("usr_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");

const loadedBinding = {
  projectId: PROJECT,
  environmentId: ENV,
  binding: {
    secretId: "sec_test" as never,
    secretVersionId: "sv_test" as never,
    variableKey: "TEST_KEY" as never,
  },
};

const baseInput = {
  keyring: {} as never,
  organizationId: ORG,
  grantId: GRANT,
  selector: { kind: "variable_key" as const, variableKey: "TEST_KEY" as const },
  actor: { type: "user" as const, userId: ACTOR_USER },
};

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    resolveEffectiveAccess: vi.fn(actual.resolveEffectiveAccess),
  };
});

vi.mock("@insecur/audit", () => ({
  auditActorUserId: vi.fn(),
  recordRuntimeInjectionAudit: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
}));

describe("executeConsumeInjectionGrant actor guard", () => {
  beforeEach(() => {
    vi.mocked(auditActorUserId).mockReset();
    vi.mocked(resolveEffectiveAccess).mockReset();
  });

  it("returns insufficient_scope for machine actors before access resolution", async () => {
    await expect(
      executeConsumeInjectionGrant(
        {
          ...baseInput,
          actor: { type: "machine", machineIdentityId: MACHINE },
        },
        loadedBinding,
      ),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(auditActorUserId).not.toHaveBeenCalled();
    expect(resolveEffectiveAccess).not.toHaveBeenCalled();
  });

  it("returns insufficient_scope for ci_exchange actors before access resolution", async () => {
    await expect(
      executeConsumeInjectionGrant(
        {
          ...baseInput,
          actor: { type: "ci_exchange" },
        },
        loadedBinding,
      ),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(auditActorUserId).not.toHaveBeenCalled();
    expect(resolveEffectiveAccess).not.toHaveBeenCalled();
  });
});
