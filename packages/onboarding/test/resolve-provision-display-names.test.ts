import { brandValue, type DisplayName } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES } from "../src/default-display-names.js";
import { resolveProvisionDisplayNames } from "../src/resolve-provision-display-names.js";
import { TEST_INSTANCE_ID, TEST_USER_ID } from "../../tenant-store/test/rls/test-ids.js";
import { userId } from "@insecur/domain";

const admittedUser = userId.brand(TEST_USER_ID);

function displayName(value: string): DisplayName {
  return brandValue<string, "DisplayName">(value);
}

describe("resolveProvisionDisplayNames", () => {
  it("returns product default display names when overrides are omitted", () => {
    const resolved = resolveProvisionDisplayNames({
      userId: admittedUser,
      instanceId: TEST_INSTANCE_ID,
      isAdmitted: true,
    });

    expect(resolved).toEqual({
      organizationDisplayName: displayName(GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES.organization),
      projectDisplayName: displayName(GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES.project),
      teamDisplayName: displayName(GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES.team),
      environmentDisplayName: displayName(GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES.environment),
    });
  });

  it("uses caller-provided display name overrides", () => {
    const resolved = resolveProvisionDisplayNames({
      userId: admittedUser,
      instanceId: TEST_INSTANCE_ID,
      isAdmitted: true,
      organizationDisplayName: displayName("Acme workspace"),
      projectDisplayName: displayName("Launch app"),
      teamDisplayName: displayName("Core team"),
      environmentDisplayName: displayName("Sandbox"),
    });

    expect(resolved).toEqual({
      organizationDisplayName: displayName("Acme workspace"),
      projectDisplayName: displayName("Launch app"),
      teamDisplayName: displayName("Core team"),
      environmentDisplayName: displayName("Sandbox"),
    });
  });

  it("returns caller overrides without consulting fallback defaults", () => {
    const resolved = resolveProvisionDisplayNames({
      userId: admittedUser,
      instanceId: TEST_INSTANCE_ID,
      isAdmitted: true,
      organizationDisplayName: displayName("Custom org"),
      projectDisplayName: displayName("Custom project"),
    });

    expect(resolved.organizationDisplayName).toBe(displayName("Custom org"));
    expect(resolved.projectDisplayName).toBe(displayName("Custom project"));
    expect(resolved.teamDisplayName).toBe(
      displayName(GUIDED_ORGANIZATION_DEFAULT_DISPLAY_NAMES.team),
    );
  });
});
