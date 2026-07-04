import {
  environmentId,
  injectionGrantId,
  organizationId,
  projectId,
  secretId,
  secretVersionId,
  type VariableKey,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  classifyConsumeAllFailure,
  classifyConsumeFailure,
  getBoundGrant,
  getBoundGrants,
  isPolicyBackedGrant,
} from "../src/injection-grants/injection-grant-bindings.js";
import type { InjectionGrantRow } from "../src/injection-grants/types.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const VERSION = secretVersionId.brand("sv_00000000000000000000000001");
const VARIABLE_KEY = "API_KEY" as VariableKey;

function grantRow(overrides: Partial<InjectionGrantRow> = {}): InjectionGrantRow {
  return {
    id: GRANT,
    org_id: ORG,
    project_id: PROJECT,
    environment_id: ENV,
    variable_keys: [VARIABLE_KEY],
    secret_ids: [SECRET],
    secret_version_ids: [VERSION],
    policy_id: null,
    policy_version_id: null,
    expires_at: new Date(Date.now() + 60_000),
    consumed_at: null,
    ...overrides,
  };
}

describe("injection grant bindings", () => {
  it("detects policy-backed grants by policy_id", () => {
    expect(isPolicyBackedGrant(grantRow())).toBe(false);
    expect(isPolicyBackedGrant(grantRow({ policy_id: "rp_00000000000000000000000011" }))).toBe(
      true,
    );
  });

  it("returns null bindings when grant arrays are mismatched or empty", () => {
    expect(getBoundGrants(grantRow({ secret_ids: [] }))).toBeNull();
    expect(
      getBoundGrants(
        grantRow({
          secret_ids: [SECRET],
          variable_keys: [],
          secret_version_ids: [VERSION],
        }),
      ),
    ).toBeNull();
    expect(
      getBoundGrants(
        grantRow({
          secret_ids: [SECRET, secretId.generate()],
          variable_keys: [VARIABLE_KEY],
          secret_version_ids: [VERSION],
        }),
      ),
    ).toBeNull();
  });

  it("returns normalized bindings for aligned single-key grants", () => {
    expect(getBoundGrants(grantRow())).toEqual([
      {
        grantId: GRANT,
        projectId: PROJECT,
        environmentId: ENV,
        secretId: SECRET,
        secretVersionId: VERSION,
        variableKey: VARIABLE_KEY,
      },
    ]);
  });

  it("returns null single binding for policy-backed grants", () => {
    expect(getBoundGrant(grantRow({ policy_id: "rp_00000000000000000000000011" }))).toBeNull();
  });

  it("classifies single-consume failures for policy-backed grants as consume_mode_mismatch", () => {
    expect(
      classifyConsumeFailure(
        grantRow({ policy_id: "rp_00000000000000000000000011" }),
        SECRET,
        VARIABLE_KEY,
      ),
    ).toBe("consume_mode_mismatch");
  });

  it("classifies consume-all failures for non-policy grants as consume_mode_mismatch", () => {
    expect(classifyConsumeAllFailure(grantRow())).toBe("consume_mode_mismatch");
  });

  it("classifies consume-all failures for missing grants and invalid bindings", () => {
    expect(classifyConsumeAllFailure(null)).toBe("not_found");
    expect(
      classifyConsumeAllFailure(
        grantRow({
          policy_id: "rp_00000000000000000000000011",
          secret_ids: [],
        }),
      ),
    ).toBe("not_found");
  });

  it("classifies consume-all replay and expiry failures", () => {
    const policyGrant = grantRow({ policy_id: "rp_00000000000000000000000011" });
    expect(classifyConsumeAllFailure({ ...policyGrant, consumed_at: new Date() })).toBe(
      "already_consumed",
    );
    expect(
      classifyConsumeAllFailure({
        ...policyGrant,
        expires_at: new Date(Date.now() - 1_000),
      }),
    ).toBe("expired");
  });
});
