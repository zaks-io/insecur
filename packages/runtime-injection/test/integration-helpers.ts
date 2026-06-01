import {
  environmentId,
  organizationId,
  projectId,
  userId,
  type OrganizationId,
} from "@insecur/domain";

import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

export function testOrganization(): OrganizationId {
  return organizationId.brand(TEST_ORG_A_ID);
}

export function testProject() {
  return projectId.brand(TEST_PROJECT_A_ID);
}

export function testEnvironment() {
  return environmentId.brand(TEST_ENV_A_ID);
}

export function testActor() {
  return { type: "user" as const, userId: userId.brand(TEST_USER_ID) };
}
