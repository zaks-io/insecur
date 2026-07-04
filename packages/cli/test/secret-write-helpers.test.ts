import { describe, expect, it } from "vitest";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { parseVariableKeyOrThrow } from "../src/commands/parse-variable-key.js";
import {
  buildProfileRunResolvedTargets,
  buildRunResolvedTargets,
} from "../src/commands/run-result.js";
import { buildSecretsSetResolvedTargets } from "../src/commands/secrets-set-result.js";
import { CliError } from "../src/output/cli-error.js";
import { buildSecretWriteResolvedTargets } from "../src/output/secret-write-target-echo.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const ENV_ID = "env_01TEST0000000000000000001";
const GRANT_ID = "igr_01TEST00000000000000000001";
const SECRET_ID = "sec_01TEST00000000000000000001";

const scope = {
  orgId: ORG_ID as never,
  projectId: PROJECT_ID as never,
  envId: ENV_ID as never,
};

describe("parseVariableKeyOrThrow", () => {
  it("returns parsed variable keys for valid input", () => {
    expect(parseVariableKeyOrThrow("API_KEY")).toBe("API_KEY");
  });

  it("throws a validation CliError for invalid input", () => {
    expect(() => parseVariableKeyOrThrow("bad-key")).toThrow(
      expect.objectContaining({
        code: VALIDATION_ERROR_CODES.invalidVariableKey,
      } satisfies Partial<CliError>),
    );
  });
});

describe("buildSecretWriteResolvedTargets", () => {
  it("builds organization, project, environment, and secret targets", () => {
    expect(
      buildSecretWriteResolvedTargets({
        scope,
        variableKey: "API_KEY",
        secretId: SECRET_ID,
      }),
    ).toEqual([
      { type: "organization", id: ORG_ID },
      {
        type: "project",
        id: PROJECT_ID,
        parent: { type: "organization", id: ORG_ID },
      },
      {
        type: "environment",
        id: ENV_ID,
        parent: { type: "project", id: PROJECT_ID },
      },
      {
        type: "secret",
        id: SECRET_ID,
        slug: "API_KEY",
        parent: { type: "environment", id: ENV_ID },
      },
    ]);
  });

  it("includes an injection grant target when requested", () => {
    expect(
      buildSecretWriteResolvedTargets({
        scope,
        variableKey: "API_KEY",
        secretId: SECRET_ID,
        injectionGrantId: GRANT_ID,
      }),
    ).toEqual([
      { type: "organization", id: ORG_ID },
      {
        type: "project",
        id: PROJECT_ID,
        parent: { type: "organization", id: ORG_ID },
      },
      {
        type: "environment",
        id: ENV_ID,
        parent: { type: "project", id: PROJECT_ID },
      },
      {
        type: "injection_grant",
        id: GRANT_ID,
        parent: { type: "environment", id: ENV_ID },
      },
      {
        type: "secret",
        id: SECRET_ID,
        slug: "API_KEY",
        parent: { type: "environment", id: ENV_ID },
      },
    ]);
  });
});

describe("command resolved target builders", () => {
  it("buildRunResolvedTargets includes the injection grant target", () => {
    expect(
      buildRunResolvedTargets(scope, "API_KEY", { grantId: GRANT_ID }, { secretId: SECRET_ID }),
    ).toEqual(
      buildSecretWriteResolvedTargets({
        scope,
        variableKey: "API_KEY",
        secretId: SECRET_ID,
        injectionGrantId: GRANT_ID,
      }),
    );
  });

  it("buildProfileRunResolvedTargets includes profile, policy, grant, and secret targets", () => {
    const profileId = "prof_01TEST00000000000000000001" as never;
    const policyId = "rp_01TEST00000000000000000001" as never;
    expect(
      buildProfileRunResolvedTargets({
        scope,
        profileId,
        profile: {
          slug: "local-dev",
          displayName: "Local development" as never,
          host: "https://insecur.test",
          orgId: ORG_ID as never,
          projectId: PROJECT_ID as never,
          envId: ENV_ID as never,
          defaultRunPolicyId: policyId,
        },
        policyId,
        issueData: { grantId: GRANT_ID },
        delivery: {
          grantId: GRANT_ID,
          entries: [
            {
              variableKey: "API_KEY",
              secretId: SECRET_ID,
              secretVersionId: "sv_01TEST00000000000000000001",
              encodedValueUtf8: "ignored",
            },
          ],
        },
      }),
    ).toEqual([
      {
        type: "cli_profile",
        id: profileId,
        slug: "local-dev",
        displayName: "Local development",
      },
      {
        type: "runtime_policy",
        id: policyId,
        parent: { type: "environment", id: ENV_ID },
      },
      {
        type: "injection_grant",
        id: GRANT_ID,
        parent: { type: "environment", id: ENV_ID },
      },
      ...buildSecretWriteResolvedTargets({
        scope,
        variableKey: "API_KEY",
        secretId: SECRET_ID,
        injectionGrantId: GRANT_ID,
      }),
    ]);
  });

  it("buildSecretsSetResolvedTargets omits the injection grant target", () => {
    expect(
      buildSecretsSetResolvedTargets(scope, "API_KEY", {
        secretId: SECRET_ID,
        secretVersionId: "sv_01TEST00000000000000000001",
        variableKey: "API_KEY",
        createdSecretShape: true,
      }),
    ).toEqual(
      buildSecretWriteResolvedTargets({
        scope,
        variableKey: "API_KEY",
        secretId: SECRET_ID,
      }),
    );
  });
});
