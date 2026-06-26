import { environmentId, membershipId, organizationId, projectId, teamId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  mintGuidedOrganizationIds,
  toStoreResourceIds,
} from "../src/mint-guided-organization-ids.js";
import { mintOperatorOrganizationIds } from "../src/mint-operator-organization-ids.js";

const GUIDED_IDS = {
  organizationId: organizationId.brand("org_00000000000000000000000088"),
  defaultTeamId: teamId.brand("team_00000000000000000000000088"),
  ownerMembershipId: membershipId.brand("mem_00000000000000000000000088"),
  projectId: projectId.brand("prj_00000000000000000000000088"),
  developmentEnvironmentId: environmentId.brand("env_00000000000000000000000088"),
};

const OPERATOR_IDS = {
  organizationId: organizationId.brand("org_00000000000000000000000099"),
  defaultTeamId: teamId.brand("team_00000000000000000000000099"),
};

describe("mintGuidedOrganizationIds", () => {
  it("returns client-minted resource ids unchanged", () => {
    expect(mintGuidedOrganizationIds(GUIDED_IDS)).toEqual(GUIDED_IDS);
  });

  it("generates opaque ids when resource ids are omitted", () => {
    const generated = mintGuidedOrganizationIds(undefined);
    expect(generated.organizationId).toMatch(/^org_/);
    expect(generated.defaultTeamId).toMatch(/^team_/);
    expect(generated.ownerMembershipId).toMatch(/^mem_/);
    expect(generated.projectId).toMatch(/^prj_/);
    expect(generated.developmentEnvironmentId).toMatch(/^env_/);
  });
});

describe("toStoreResourceIds", () => {
  it("maps provision resource ids to store ids without mutation", () => {
    expect(toStoreResourceIds(GUIDED_IDS)).toEqual(GUIDED_IDS);
  });
});

describe("mintOperatorOrganizationIds", () => {
  it("returns client-minted operator organization ids unchanged", () => {
    expect(mintOperatorOrganizationIds(OPERATOR_IDS)).toEqual(OPERATOR_IDS);
  });

  it("generates opaque ids when operator resource ids are omitted", () => {
    const generated = mintOperatorOrganizationIds(undefined);
    expect(generated.organizationId).toMatch(/^org_/);
    expect(generated.defaultTeamId).toMatch(/^team_/);
  });
});
