import { describe, expect, it } from "vitest";
import {
  mintOnboardingResourceIds,
  parseOnboardingResourceIds,
  parseProvisionOutcome,
  parseProvisionSubmission,
  workspaceNameError,
} from "./provisioning.js";

const body = `${"0".repeat(25)}1`;
const ids = {
  organizationId: `org_${body}`,
  defaultTeamId: `team_${body}`,
  ownerMembershipId: `mem_${body}`,
  projectId: `prj_${body}`,
  developmentEnvironmentId: `env_${body}`,
};

describe("mintOnboardingResourceIds", () => {
  it("mints a parseable, distinct ID set", () => {
    const minted = mintOnboardingResourceIds();
    expect(parseOnboardingResourceIds(minted)).toEqual(minted);
    expect(mintOnboardingResourceIds()).not.toEqual(minted);
  });
});

describe("parseProvisionOutcome", () => {
  it("extracts the workspace IDs from the provisioning success envelope", () => {
    const outcome = parseProvisionOutcome({ ok: true, data: ids });
    expect(outcome).toEqual({
      ok: true,
      workspace: {
        organizationId: ids.organizationId,
        projectId: ids.projectId,
        environmentId: ids.developmentEnvironmentId,
      },
    });
  });

  it("passes catalogued error codes through for the interface voice", () => {
    const outcome = parseProvisionOutcome({
      ok: false,
      error: { code: "onboarding.resource_conflict", message: "wire text", retryable: false },
    });
    expect(outcome).toEqual({ ok: false, code: "onboarding.resource_conflict" });
  });

  it.each([
    null,
    "nope",
    { ok: true, data: { organizationId: ids.organizationId } },
    { ok: true, data: { ...ids, developmentEnvironmentId: "env_not-a-valid-id" } },
    { ok: false, error: { code: "not.in_catalog", message: "x", retryable: false } },
    { ok: false },
  ])("fails closed to web.unexpected_response on %j", (body) => {
    expect(parseProvisionOutcome(body)).toEqual({ ok: false, code: "web.unexpected_response" });
  });
});

describe("parseProvisionSubmission", () => {
  const submission = {
    csrfToken: "token",
    organizationName: "Acme Corp",
    projectName: "Payments",
    resourceIds: ids,
  };

  it("accepts a complete submission", () => {
    expect(parseProvisionSubmission(submission)).toEqual(submission);
  });

  it.each([
    null,
    {},
    { ...submission, csrfToken: 7 },
    { ...submission, organizationName: undefined },
    { ...submission, resourceIds: { ...ids, projectId: `env_${body}` } },
    { ...submission, resourceIds: undefined },
  ])("rejects a malformed submission: %j", (data) => {
    expect(parseProvisionSubmission(data)).toBeNull();
  });
});

describe("workspaceNameError", () => {
  it("accepts a normal name", () => {
    expect(workspaceNameError("Acme Corp")).toBeUndefined();
  });

  it("flags an empty name", () => {
    expect(workspaceNameError("   ")).toBe("empty");
  });

  it("flags an invalid name", () => {
    expect(workspaceNameError("a".repeat(201))).toBe("invalid");
    expect(workspaceNameError("bad\u0000name")).toBe("invalid");
  });
});
