import { AUTH_ERROR_CODES, organizationId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { assertOrganizationMembership } from "../src/assert-organization-membership.js";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import {
  TEST_NO_SCOPE_USER_ID,
  TEST_ORG_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const ORG = organizationId.brand(TEST_ORG_A_ID);
const MEMBER = userId.brand(TEST_USER_ID);
const OUTSIDER = userId.brand(TEST_NO_SCOPE_USER_ID);

describeIntegration("assertOrganizationMembership", () => {
  it("allows actors with any membership in the organization", async () => {
    await expect(
      assertOrganizationMembership({ type: "user", userId: MEMBER }, ORG),
    ).resolves.toBeUndefined();
  });

  it("rejects actors without membership in the organization", async () => {
    await expect(
      assertOrganizationMembership({ type: "user", userId: OUTSIDER }, ORG),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  });
});
