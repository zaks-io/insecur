import {
  AUTH_ERROR_CODES,
  membershipId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import {
  AUTHORIZATION_SCOPES,
  authorizeScopeOrThrow,
  type LoadMembershipsFn,
  type MembershipRow,
} from "../src/index.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQUEST = requestId.brand("req_00000000000000000000000001");

const actor = { type: "user" as const, userId: USER };
const auditActor = { type: "user" as const, userId: USER };
const coordinate = { organizationId: ORG, projectId: PROJECT };

function ownerMembership(): MembershipRow {
  return {
    membershipId: membershipId.brand("mem_00000000000000000000000001"),
    organizationId: ORG,
    projectId: null,
    userId: USER,
    rolePreset: "owner",
  };
}

describe("authorizeScopeOrThrow", () => {
  it("returns without recording a denial when Effective Access includes the required scope", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [ownerMembership()]);
    const recordAccessDenial = vi.fn(async () => undefined);

    await authorizeScopeOrThrow({
      actor,
      auditActor,
      coordinate,
      requiredScope: AUTHORIZATION_SCOPES.organizationRead,
      requestId: REQUEST,
      deps: { loadMemberships, recordAccessDenial },
    });

    expect(loadMemberships).toHaveBeenCalledOnce();
    expect(recordAccessDenial).not.toHaveBeenCalled();
  });

  it("records denied access and throws auth.insufficient_scope when scope is missing", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => []);
    const recordAccessDenial = vi.fn(async () => undefined);

    await expect(
      authorizeScopeOrThrow({
        actor,
        auditActor,
        coordinate,
        requiredScope: AUTHORIZATION_SCOPES.organizationRead,
        requestId: REQUEST,
        deps: { loadMemberships, recordAccessDenial },
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(recordAccessDenial).toHaveBeenCalledWith({
      actor: auditActor,
      organizationId: ORG,
      projectId: PROJECT,
      request: { requestId: REQUEST },
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    });
  });

  it("records denied access for org-only coordinates without project metadata", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => []);
    const recordAccessDenial = vi.fn(async () => undefined);

    await expect(
      authorizeScopeOrThrow({
        actor,
        auditActor,
        coordinate: { organizationId: ORG },
        requiredScope: AUTHORIZATION_SCOPES.organizationRead,
        requestId: REQUEST,
        deps: { loadMemberships, recordAccessDenial },
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(recordAccessDenial).toHaveBeenCalledWith({
      actor: auditActor,
      organizationId: ORG,
      request: { requestId: REQUEST },
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    });
  });

  it("preserves auth.insufficient_scope when denied-audit recording fails", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => []);
    const recordAccessDenial = vi.fn(async () => {
      throw new Error("audit unavailable");
    });

    await expect(
      authorizeScopeOrThrow({
        actor,
        auditActor,
        coordinate,
        requiredScope: AUTHORIZATION_SCOPES.organizationRead,
        requestId: REQUEST,
        deps: { loadMemberships, recordAccessDenial },
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });
});
