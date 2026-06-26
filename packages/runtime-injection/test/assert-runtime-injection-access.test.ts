import { AUTHORIZATION_SCOPES, type LoadMembershipsFn } from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import {
  assertHoldsAnyIssuanceScope,
  assertRuntimeInjectionAccess,
  resolveIssueGrantRequiredScope,
} from "../src/assert-runtime-injection-access.js";
import { InjectionGrantError } from "../src/injection-grant-error.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const ACTOR_USER = userId.brand("usr_00000000000000000000000001");

describe("assertRuntimeInjectionAccess", () => {
  const coordinate = { organizationId: ORG, projectId: PROJECT, environmentId: ENV };

  it("passes when effective access includes the required scope", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [
      {
        membershipId: "mem_test" as never,
        organizationId: ORG,
        projectId: PROJECT,
        userId: ACTOR_USER,
        rolePreset: "developer",
      },
    ]);

    await expect(
      assertRuntimeInjectionAccess(
        { type: "user", userId: ACTOR_USER },
        coordinate,
        resolveIssueGrantRequiredScope(false),
        { loadMemberships },
      ),
    ).resolves.toBeUndefined();
  });

  it("fails closed when effective access lacks the required protected scope", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [
      {
        membershipId: "mem_test" as never,
        organizationId: ORG,
        projectId: PROJECT,
        userId: ACTOR_USER,
        rolePreset: "developer",
      },
    ]);

    await expect(
      assertRuntimeInjectionAccess(
        { type: "user", userId: ACTOR_USER },
        coordinate,
        resolveIssueGrantRequiredScope(true),
        { loadMemberships },
      ),
    ).rejects.toBeInstanceOf(InjectionGrantError);

    await expect(
      assertRuntimeInjectionAccess(
        { type: "user", userId: ACTOR_USER },
        coordinate,
        AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected,
        { loadMemberships },
      ),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });
});

describe("assertHoldsAnyIssuanceScope", () => {
  const coordinate = { organizationId: ORG, projectId: PROJECT, environmentId: ENV };

  it("passes when effective access includes either issuance atom", async () => {
    await expect(
      assertHoldsAnyIssuanceScope({ type: "user", userId: ACTOR_USER }, coordinate, {
        loadMemberships: vi.fn(async () => [
          {
            membershipId: "mem_owner" as never,
            organizationId: ORG,
            projectId: PROJECT,
            userId: ACTOR_USER,
            rolePreset: "owner",
          },
        ]),
      }),
    ).resolves.toBeUndefined();
  });

  it("fails closed when effective access includes neither issuance atom", async () => {
    await expect(
      assertHoldsAnyIssuanceScope({ type: "user", userId: ACTOR_USER }, coordinate, {
        loadMemberships: vi.fn(async () => [
          {
            membershipId: "mem_read" as never,
            organizationId: ORG,
            projectId: PROJECT,
            userId: ACTOR_USER,
            rolePreset: "read_only",
          },
        ]),
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });
});
