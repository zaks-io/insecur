import { environmentId, machineIdentityId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  toEnvironmentDeployKeyRow,
  toGitHubActionsOidcRow,
} from "../src/machine-access/project-machine-identity-row-mappers.js";

const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

describe("toGitHubActionsOidcRow", () => {
  it("maps valid OIDC auth method rows", () => {
    expect(
      toGitHubActionsOidcRow({
        id: "oidc_00000000000000000000000001",
        machineIdentityId: MACHINE,
        environmentId: ENV,
        githubRepository: "zaks-io/insecur",
        githubEnvironment: "production",
        status: "active",
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
      }),
    ).toEqual({
      authMethodId: "oidc_00000000000000000000000001",
      machineIdentityId: MACHINE,
      environmentId: ENV,
      githubRepository: "zaks-io/insecur",
      githubEnvironment: "production",
      status: "active",
      createdAt: new Date("2026-06-24T00:00:00.000Z"),
    });
  });

  it("returns null for invalid status or identifiers", () => {
    expect(
      toGitHubActionsOidcRow({
        id: "oidc_00000000000000000000000001",
        machineIdentityId: "not-a-machine-id",
        environmentId: ENV,
        githubRepository: "zaks-io/insecur",
        githubEnvironment: null,
        status: "active",
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
      }),
    ).toBeNull();
  });

  it("accepts project-scoped OIDC methods without an environment binding", () => {
    expect(
      toGitHubActionsOidcRow({
        id: "oidc_00000000000000000000000002",
        machineIdentityId: MACHINE,
        environmentId: null,
        githubRepository: "zaks-io/insecur",
        githubEnvironment: null,
        status: "disabled",
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
      }),
    ).toMatchObject({
      environmentId: null,
      githubEnvironment: null,
      status: "disabled",
    });
  });
});

describe("toEnvironmentDeployKeyRow", () => {
  it("maps valid deploy key metadata rows without secret material fields", () => {
    const row = toEnvironmentDeployKeyRow({
      id: "edk_00000000000000000000000001",
      machineIdentityId: MACHINE,
      environmentId: ENV,
      status: "active",
      nonExpiring: false,
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
      rotationIntervalSeconds: 86_400,
      rotationReminderIntervalSeconds: 7_200,
      createdAt: new Date("2026-06-24T00:00:00.000Z"),
    });

    expect(row).toEqual({
      authMethodId: "edk_00000000000000000000000001",
      machineIdentityId: MACHINE,
      environmentId: ENV,
      status: "active",
      nonExpiring: false,
      expiresAt: new Date("2026-12-31T00:00:00.000Z"),
      rotationIntervalSeconds: 86_400,
      rotationReminderIntervalSeconds: 7_200,
      createdAt: new Date("2026-06-24T00:00:00.000Z"),
    });
    expect(JSON.stringify(row)).not.toMatch(/secret|hash|token|credential/i);
  });
});
