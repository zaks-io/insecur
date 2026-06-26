import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  encodeRequestValueUtf8,
  parseEnvironmentIdParam,
  parseGrantIdParam,
  parseGuidedOrganizationResourceIds,
  parseInjectionGrantIssueSelector,
  parseJsonBody,
  parseOperationIdParam,
  parseOptionalDisplayName,
  parseOptionalSecretId,
  parseOrganizationIdParam,
  parseProjectIdParam,
  parseVariableKeyField,
  readOptionalBoolean,
  readOptionalString,
  readRequiredString,
  readSecretValueField,
  requireRouteParam,
} from "./parse-route-input.js";

const VALID_ORG = "org_01TEST00000000000000000001";
const VALID_PROJECT = "prj_01TEST00000000000000000001";
const VALID_ENV = "env_01TEST00000000000000000001";
const VALID_GRANT = "igr_01TEST00000000000000000001";
const VALID_OPERATION = "op_01TEST00000000000000000001";
const VALID_SEC_ID = "sec_01TEST00000000000000000001";
const VALID_TEAM = "team_01TEST00000000000000000001";
const VALID_MEMBERSHIP = "mem_01TEST00000000000000000001";

function expectValidationError(fn: () => unknown, message: string, code: string): void {
  expect(fn).toThrow(
    expect.objectContaining({
      message,
      code,
    }),
  );
}

describe("requireRouteParam", () => {
  it("returns the value when present", () => {
    expect(requireRouteParam("abc", "orgId")).toBe("abc");
  });

  it("rejects undefined and empty values", () => {
    for (const value of [undefined, ""] as const) {
      expectValidationError(
        () => requireRouteParam(value, "orgId"),
        "Missing route parameter: orgId.",
        VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      );
    }
  });
});

describe("branded route id params", () => {
  it("parses valid organization, project, environment, grant, and operation ids", () => {
    expect(parseOrganizationIdParam(VALID_ORG)).toBe(VALID_ORG);
    expect(parseProjectIdParam(VALID_PROJECT)).toBe(VALID_PROJECT);
    expect(parseEnvironmentIdParam(VALID_ENV)).toBe(VALID_ENV);
    expect(parseGrantIdParam(VALID_GRANT)).toBe(VALID_GRANT);
    expect(parseOperationIdParam(VALID_OPERATION)).toBe(VALID_OPERATION);
  });

  it("rejects malformed branded ids with stable messages", () => {
    expectValidationError(
      () => parseOrganizationIdParam("not-an-org"),
      "Invalid organization id.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
    expectValidationError(
      () => parseProjectIdParam("not-a-project"),
      "Invalid project id.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
    expectValidationError(
      () => parseEnvironmentIdParam("not-an-env"),
      "Invalid environment id.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
    expectValidationError(
      () => parseGrantIdParam("not-a-grant"),
      "Invalid injection grant id.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
    expectValidationError(
      () => parseOperationIdParam("not-an-operation"),
      "Invalid operation id.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
  });
});

describe("parseVariableKeyField", () => {
  it("accepts env-var-safe keys", () => {
    expect(parseVariableKeyField("DATABASE_URL")).toBe("DATABASE_URL");
  });

  it("rejects invalid variable keys", () => {
    expectValidationError(
      () => parseVariableKeyField("database_url"),
      "Invalid variable key.",
      VALIDATION_ERROR_CODES.invalidVariableKey,
    );
  });
});

describe("parseOptionalSecretId", () => {
  it("returns undefined when absent", () => {
    expect(parseOptionalSecretId(undefined)).toBeUndefined();
  });

  it("parses a valid secret id", () => {
    expect(parseOptionalSecretId(VALID_SEC_ID)).toBe(VALID_SEC_ID);
  });

  it("rejects malformed secret ids", () => {
    expectValidationError(
      () => parseOptionalSecretId("not-a-secret"),
      "Invalid secret id.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
  });
});

describe("parseOptionalDisplayName", () => {
  it("returns undefined when absent", () => {
    expect(parseOptionalDisplayName(undefined)).toBeUndefined();
  });

  it("parses a valid display name", () => {
    expect(parseOptionalDisplayName("  Production API  ")).toBe("Production API");
  });

  it("rejects empty and invalid display names", () => {
    expectValidationError(
      () => parseOptionalDisplayName("   "),
      "Invalid display name.",
      VALIDATION_ERROR_CODES.displayNameEmpty,
    );
    expectValidationError(
      () => parseOptionalDisplayName("a\u0007"),
      "Invalid display name.",
      VALIDATION_ERROR_CODES.invalidDisplayName,
    );
  });
});

describe("parseJsonBody", () => {
  it("accepts plain objects", () => {
    const body = { field: "value" };
    expect(parseJsonBody(body)).toBe(body);
  });

  it("rejects non-object bodies", () => {
    for (const raw of [null, [], "string", 42] as const) {
      expectValidationError(
        () => parseJsonBody(raw),
        "Request body must be a JSON object.",
        VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      );
    }
  });
});

describe("readRequiredString", () => {
  it("returns trimmed non-empty strings", () => {
    expect(readRequiredString({ name: "alpha" }, "name")).toBe("alpha");
  });

  it("rejects missing, blank, and non-string values", () => {
    expectValidationError(
      () => readRequiredString({}, "name"),
      "Missing required field: name.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
    expectValidationError(
      () => readRequiredString({ name: "   " }, "name"),
      "Missing required field: name.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
    expectValidationError(
      () => readRequiredString({ name: 1 }, "name"),
      "Missing required field: name.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
  });
});

describe("readOptionalString", () => {
  it("returns undefined when absent", () => {
    expect(readOptionalString({}, "label")).toBeUndefined();
  });

  it("returns string values", () => {
    expect(readOptionalString({ label: "beta" }, "label")).toBe("beta");
  });

  it("rejects non-string values", () => {
    expectValidationError(
      () => readOptionalString({ label: false }, "label"),
      "Invalid field: label.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
  });
});

describe("readSecretValueField", () => {
  it("returns the value field when it is a string", () => {
    expect(readSecretValueField({ value: "test-field-value" })).toBe("test-field-value");
  });

  it("rejects missing or non-string value fields", () => {
    expectValidationError(
      () => readSecretValueField({}),
      "Missing required field: value.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
    expectValidationError(
      () => readSecretValueField({ value: 123 }),
      "Missing required field: value.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
  });
});

describe("readOptionalBoolean", () => {
  it("returns undefined when absent", () => {
    expect(readOptionalBoolean({}, "enabled")).toBeUndefined();
  });

  it("returns boolean values", () => {
    expect(readOptionalBoolean({ enabled: true }, "enabled")).toBe(true);
    expect(readOptionalBoolean({ enabled: false }, "enabled")).toBe(false);
  });

  it("rejects non-boolean values", () => {
    expectValidationError(
      () => readOptionalBoolean({ enabled: "yes" }, "enabled"),
      "Invalid field: enabled.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
  });
});

describe("encodeRequestValueUtf8", () => {
  it("encodes strings as UTF-8 bytes", () => {
    expect(encodeRequestValueUtf8("hello")).toEqual(new TextEncoder().encode("hello"));
    expect(encodeRequestValueUtf8("café")).toEqual(new TextEncoder().encode("café"));
  });
});

describe("parseInjectionGrantIssueSelector", () => {
  it("accepts exactly one variableKey selector", () => {
    expect(parseInjectionGrantIssueSelector({ variableKey: "DATABASE_URL" })).toEqual({
      kind: "variable_key",
      variableKey: "DATABASE_URL",
    });
  });

  it("accepts exactly one secretId selector", () => {
    expect(parseInjectionGrantIssueSelector({ secretId: VALID_SEC_ID })).toEqual({
      kind: "secret_id",
      secretId: VALID_SEC_ID,
    });
  });

  it("rejects missing both selectors", () => {
    expectValidationError(
      () => parseInjectionGrantIssueSelector({}),
      "Exactly one of variableKey or secretId is required.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
  });

  it("rejects both selectors together", () => {
    expectValidationError(
      () =>
        parseInjectionGrantIssueSelector({
          variableKey: "DATABASE_URL",
          secretId: VALID_SEC_ID,
        }),
      "Exactly one of variableKey or secretId is required.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
  });

  it("rejects invalid secretId values", () => {
    expectValidationError(
      () => parseInjectionGrantIssueSelector({ secretId: "not-a-secret" }),
      "Invalid secret id.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
  });

  it("rejects invalid variableKey values", () => {
    expectValidationError(
      () => parseInjectionGrantIssueSelector({ variableKey: "bad-key" }),
      "Invalid variable key.",
      VALIDATION_ERROR_CODES.invalidVariableKey,
    );
  });
});

describe("parseGuidedOrganizationResourceIds", () => {
  const validResourceIds = {
    organizationId: VALID_ORG,
    defaultTeamId: VALID_TEAM,
    ownerMembershipId: VALID_MEMBERSHIP,
    projectId: VALID_PROJECT,
    developmentEnvironmentId: VALID_ENV,
  };

  it("returns undefined when resourceIds is absent", () => {
    expect(parseGuidedOrganizationResourceIds({})).toBeUndefined();
  });

  it("parses a complete resourceIds object", () => {
    expect(parseGuidedOrganizationResourceIds({ resourceIds: validResourceIds })).toEqual(
      validResourceIds,
    );
  });

  it("rejects non-object resourceIds", () => {
    expectValidationError(
      () => parseGuidedOrganizationResourceIds({ resourceIds: "bad" }),
      "Invalid resourceIds.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
  });

  it("rejects malformed nested ids and missing required fields", () => {
    expectValidationError(
      () =>
        parseGuidedOrganizationResourceIds({
          resourceIds: { ...validResourceIds, organizationId: "bad-org" },
        }),
      "Invalid resourceIds.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
    expectValidationError(
      () =>
        parseGuidedOrganizationResourceIds({
          resourceIds: {
            organizationId: validResourceIds.organizationId,
            defaultTeamId: validResourceIds.defaultTeamId,
            ownerMembershipId: validResourceIds.ownerMembershipId,
            developmentEnvironmentId: validResourceIds.developmentEnvironmentId,
          },
        }),
      "Missing required field: projectId.",
      VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
    );
  });
});
