import { CREDENTIAL_SCOPES } from "@insecur/access";
import {
  environmentId,
  machineAuthMethodId,
  machineIdentityId,
  organizationId,
  projectId,
  runtimePolicyId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { DEPLOY_KEY_SECRET_ALGORITHM } from "../src/deploy-key-secret.js";
import { buildEnvironmentDeployKeyMetadata } from "../src/environment-deploy-key-metadata.js";
import type { EnvironmentDeployKeyAuthMethodRow } from "../src/environment-deploy-key-auth-method-row.js";

const NOW = 1_700_000_000;

function authMethodRow(
  overrides: Partial<EnvironmentDeployKeyAuthMethodRow> = {},
): EnvironmentDeployKeyAuthMethodRow {
  return {
    id: machineAuthMethodId.brand("mauth_00000000000000000000000004"),
    organizationId: organizationId.brand("org_00000000000000000000000001"),
    machineIdentityId: machineIdentityId.brand("mach_00000000000000000000000004"),
    projectId: projectId.brand("prj_00000000000000000000000001"),
    environmentId: environmentId.brand("env_00000000000000000000000001"),
    runtimePolicyKeyIds: [runtimePolicyId.brand("rp_00000000000000000000000001")],
    credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
    secretVerifier: {
      algorithm: DEPLOY_KEY_SECRET_ALGORITHM,
      saltB64: "c2FsdA",
      hashB64: "aGFzaA",
    },
    status: "active",
    expiresAt: new Date((NOW + 86_400) * 1000),
    nonExpiring: false,
    rotationIntervalSeconds: 2_592_000,
    rotationReminderIntervalSeconds: 604_800,
    createdAt: new Date((NOW - 2_000_000) * 1000),
    ...overrides,
  };
}

describe("environment-deploy-key-metadata", () => {
  it("marks non-expiring keys as visibly risky in metadata-only output", () => {
    const metadata = buildEnvironmentDeployKeyMetadata(
      authMethodRow({
        nonExpiring: true,
        expiresAt: null,
      }),
      NOW,
    );

    expect(metadata.nonExpiring).toBe(true);
    expect(metadata.nonExpiringRiskVisible).toBe(true);
    expect(metadata.expiresAt).toBeNull();
  });

  it("surfaces rotation reminder metadata without secret material", () => {
    const metadata = buildEnvironmentDeployKeyMetadata(authMethodRow(), NOW);

    expect(metadata.rotationIntervalSeconds).toBe(2_592_000);
    expect(metadata.rotationReminderIntervalSeconds).toBe(604_800);
    expect(metadata.rotationReminderDue).toBe(true);
    expect(Object.keys(metadata)).not.toContain("secretVerifier");
  });

  it("keeps rotationReminderDue true after the rotation boundary when the key was not rotated", () => {
    const metadata = buildEnvironmentDeployKeyMetadata(
      authMethodRow({
        createdAt: new Date((NOW - 3_000_000) * 1000),
      }),
      NOW,
    );

    expect(metadata.rotationReminderDue).toBe(true);
  });

  it("accepts Drizzle transparent-parser string timestamps from Postgres", () => {
    const metadata = buildEnvironmentDeployKeyMetadata(
      authMethodRow({
        createdAt: "2026-01-15 12:34:56.789+00",
        expiresAt: "2026-07-04 12:34:56.789+00",
      }),
      NOW,
    );

    expect(metadata.createdAt).toBe("2026-01-15T12:34:56.789Z");
    expect(metadata.expiresAt).toBe("2026-07-04T12:34:56.789Z");
  });
});
