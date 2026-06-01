import {
  AUTHORIZATION_SCOPES,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "../src/index.js";
import { organizationId, projectId, userId } from "@insecur/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeRuntimeSql } from "@insecur/tenant-store";
import { requireDatabaseUrl } from "../../tenant-store/scripts/lib/env-local.mjs";
import { seedTenantBaseline } from "../../tenant-store/test/rls/seed.js";
import {
  TEST_ORG_A_ID,
  TEST_ORG_B_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_B_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

let runtimeUrl: string | undefined;
try {
  runtimeUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
} catch {
  runtimeUrl = undefined;
}

const describeIntegration = runtimeUrl ? describe : describe.skip;

const ACTOR = {
  type: "user" as const,
  userId: userId.brand(TEST_USER_ID),
};

describeIntegration("resolveEffectiveAccess (tenant-scoped store)", () => {
  beforeAll(async () => {
    if (!runtimeUrl) {
      return;
    }
    await seedTenantBaseline();
  });

  afterAll(async () => {
    await closeRuntimeSql();
  });

  it("resolves owner First Value scopes for the seeded organization", async () => {
    const org = organizationId.brand(TEST_ORG_A_ID);
    const result = await resolveEffectiveAccess(ACTOR, {
      organizationId: org,
      projectId: projectId.brand(TEST_PROJECT_A_ID),
    });

    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.onboardingGuidedProvision)).toBe(
      true,
    );
    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.secretNonProtectedWrite)).toBe(true);
    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.runtimeInjectionRun)).toBe(true);
  });

  it("returns empty scopes when guessing another organization coordinate", async () => {
    const orgB = organizationId.brand(TEST_ORG_B_ID);
    const outsider = {
      type: "user" as const,
      userId: userId.brand("usr_00000000000000000000000099"),
    };

    const result = await resolveEffectiveAccess(outsider, {
      organizationId: orgB,
      projectId: projectId.brand(TEST_PROJECT_B_ID),
    });

    expect(result.scopes).toEqual([]);
  });
});
