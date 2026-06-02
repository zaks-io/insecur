import { describe, expect, it } from "vitest";
import { buildPersonalOrganizationRequestBody } from "../src/api/provision-request-body.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";

describe("buildPersonalOrganizationRequestBody", () => {
  it("returns an empty object when no scope ids are provided", () => {
    expect(buildPersonalOrganizationRequestBody({})).toEqual({});
  });

  it("returns nested resourceIds matching the worker route contract", () => {
    const body = buildPersonalOrganizationRequestBody({
      organizationId: "org_01TEST00000000000000000001" as never,
      projectId: "prj_01TEST00000000000000000001" as never,
      environmentId: "env_01TEST0000000000000000001" as never,
    });
    expect(body).toHaveProperty("resourceIds");
    const resourceIds = body.resourceIds as Record<string, string>;
    expect(resourceIds.organizationId).toBe("org_01TEST00000000000000000001");
    expect(resourceIds.projectId).toBe("prj_01TEST00000000000000000001");
    expect(resourceIds.developmentEnvironmentId).toBe("env_01TEST0000000000000000001");
    expect(resourceIds.defaultTeamId).toMatch(/^team_/);
    expect(resourceIds.ownerMembershipId).toMatch(/^mem_/);
  });

  it("rejects partial scope id overrides", () => {
    expect(() =>
      buildPersonalOrganizationRequestBody({
        organizationId: "org_01TEST00000000000000000001" as never,
      }),
    ).toThrowError(CliError);
    try {
      buildPersonalOrganizationRequestBody({
        organizationId: "org_01TEST00000000000000000001" as never,
      });
    } catch (error) {
      expect((error as CliError).exitCode).toBe(EXIT_VALIDATION);
    }
  });
});
