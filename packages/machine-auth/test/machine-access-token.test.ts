import { CREDENTIAL_SCOPES } from "@insecur/access";
import { environmentId, machineIdentityId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { mintMachineAccessToken, verifyMachineAccessToken } from "../src/machine-access-token.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const SECRET = "test-machine-access-signing-secret";

describe("machine access token", () => {
  it("mints and verifies environment-scoped credentials", async () => {
    const minted = await mintMachineAccessToken({
      machineIdentityId: MACHINE,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
      signingSecret: SECRET,
      ttlSeconds: 60,
    });

    const verified = await verifyMachineAccessToken(minted.accessToken, SECRET);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.token.machineIdentityId).toBe(MACHINE);
      expect(verified.token.environmentId).toBe(ENV);
      expect(verified.token.credentialScopes).toEqual([CREDENTIAL_SCOPES.runtimeInjectionRun]);
    }
  });
});
