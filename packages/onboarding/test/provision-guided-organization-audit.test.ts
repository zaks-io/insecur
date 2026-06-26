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
    writeAuditEvent: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  };
});

import { writeAuditEvent } from "@insecur/audit";
import { recordProvisionSuccess } from "../src/provision-guided-organization-audit.js";
import { TEST_INSTANCE_ID } from "../../tenant-store/test/rls/test-ids.js";

const USER = userId.brand("usr_00000000000000000000000001");
const ORG = organizationId.brand("org_00000000000000000000000088");
const TEAM = teamId.brand("team_00000000000000000000000088");
const MEM = membershipId.brand("mem_00000000000000000000000088");
const PROJECT = projectId.brand("prj_00000000000000000000000088");
const ENV = environmentId.brand("env_00000000000000000000000088");
const REQUEST = { requestId: requestId.brand("req_00000000000000000000000001") };

const writeMock = vi.mocked(writeAuditEvent);

describe("recordProvisionSuccess", () => {
  it("writes metadata-only guided provision success audit", async () => {
    writeMock.mockClear();

    await recordProvisionSuccess(
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

    expect(writeMock).toHaveBeenCalledWith({
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
