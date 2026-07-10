import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  environmentId,
  membershipId,
  organizationId,
  projectId,
  requestId,
  teamId,
  userId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    writeAuditEventInTenantScope: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  };
});

import { writeAuditEventInTenantScope } from "@insecur/audit";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { recordProvisionSuccessInTenantScope } from "../src/provision-guided-organization-audit.js";
import { TEST_INSTANCE_ID } from "../../tenant-store/test/rls/test-ids.js";

const USER = userId.brand("usr_00000000000000000000000001");
const ORG = organizationId.brand("org_00000000000000000000000088");
const TEAM = teamId.brand("team_00000000000000000000000088");
const MEM = membershipId.brand("mem_00000000000000000000000088");
const PROJECT = projectId.brand("prj_00000000000000000000000088");
const ENV = environmentId.brand("env_00000000000000000000000088");
const REQUEST = { requestId: requestId.brand("req_00000000000000000000000001") };

const writeMock = vi.mocked(writeAuditEventInTenantScope);
const SCOPED_SQL = { tag: "scoped-sql" } as unknown as TenantScopedSql;

describe("recordProvisionSuccessInTenantScope", () => {
  it("writes metadata-only guided provision success audit on the tenant scope", async () => {
    writeMock.mockClear();

    await recordProvisionSuccessInTenantScope(
      SCOPED_SQL,
      {
        userId: USER,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: true,
        request: REQUEST,
      },
      {
        organizationId: ORG,
        defaultTeamId: TEAM,
        ownerMembershipId: MEM,
        projectId: PROJECT,
        developmentEnvironmentId: ENV,
      },
    );

    expect(writeMock).toHaveBeenCalledWith(SCOPED_SQL, {
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingGuidedProvisioned,
      outcome: "success",
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      resource: { type: "organization", id: ORG },
      request: REQUEST,
    });
  });
});
