import { userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { loadUserOrganizations } from "../src/load-user-organizations.js";
import { integrationDatabaseReady } from "../../tenant-store/test/rls/integration-database-ready.js";
import {
  TEST_NO_SCOPE_USER_ID,
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const MEMBER = userId.brand(TEST_USER_ID);
const OUTSIDER = userId.brand(TEST_NO_SCOPE_USER_ID);

describeIntegration("loadUserOrganizations", () => {
  it("returns each member organization once with its display name", async () => {
    const organizations = await loadUserOrganizations(MEMBER);

    const ids = organizations.map((organization) => organization.organizationId);
    expect(ids).toContain(TEST_ORG_A_ID);
    expect(ids).toContain(TEST_ORG_B_ID);
    expect(new Set(ids).size).toBe(ids.length);

    const orgA = organizations.find(
      (organization) => organization.organizationId === TEST_ORG_A_ID,
    );
    expect(orgA?.displayName).toBe("Synthetic org");
  });

  it("returns an empty list for an actor with no memberships anywhere", async () => {
    await expect(loadUserOrganizations(OUTSIDER)).resolves.toEqual([]);
  });
});
