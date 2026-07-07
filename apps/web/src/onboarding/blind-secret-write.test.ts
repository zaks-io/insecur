import { describe, expect, it } from "vitest";
import {
  blindSecretWriteReceiptRows,
  parseBlindSecretWriteOutcome,
  parseBlindSecretWriteSubmission,
} from "./blind-secret-write.js";
import { mintOnboardingResourceIds } from "./provisioning.js";

const SENTINEL_VALUE = "canary-sentinel-value-do-not-echo";

describe("parseBlindSecretWriteSubmission", () => {
  const resourceIds = mintOnboardingResourceIds();

  it("accepts generate mode without a value field", () => {
    const parsed = parseBlindSecretWriteSubmission({
      csrfToken: "csrf",
      workspace: {
        organizationId: resourceIds.organizationId,
        projectId: resourceIds.projectId,
        environmentId: resourceIds.developmentEnvironmentId,
      },
      variableKey: "APP_SECRET",
      mode: "generate",
    });
    expect(parsed).toMatchObject({ mode: "generate", variableKey: "APP_SECRET" });
    expect(parsed).not.toHaveProperty("value");
  });

  it("accepts paste mode with a value", () => {
    const parsed = parseBlindSecretWriteSubmission({
      csrfToken: "csrf",
      workspace: {
        organizationId: resourceIds.organizationId,
        projectId: resourceIds.projectId,
        environmentId: resourceIds.developmentEnvironmentId,
      },
      variableKey: "APP_SECRET",
      mode: "value",
      value: SENTINEL_VALUE,
    });
    expect(parsed).toMatchObject({ mode: "value", value: SENTINEL_VALUE });
  });
});

describe("parseBlindSecretWriteOutcome", () => {
  it("parses a metadata receipt without echoing the submitted value", () => {
    const outcome = parseBlindSecretWriteOutcome({
      ok: true,
      data: {
        secretId: "sec_00000000000000000000000001",
        secretVersionId: "sv_00000000000000000000000001",
        variableKey: "APP_SECRET",
        createdSecretShape: true,
        auditEventId: "aud_00000000000000000000000001",
      },
    });
    expect(outcome).toMatchObject({
      ok: true,
      receipt: {
        variableKey: "APP_SECRET",
        createdSecretShape: true,
      },
    });
    expect(JSON.stringify(outcome)).not.toContain(SENTINEL_VALUE);
  });

  it("maps catalogued error codes", () => {
    expect(
      parseBlindSecretWriteOutcome({
        ok: false,
        error: { code: "auth.insufficient_scope" },
      }),
    ).toMatchObject({ ok: false, code: "auth.insufficient_scope" });
  });
});

describe("blindSecretWriteReceiptRows", () => {
  it("renders metadata-only receipt rows", () => {
    const rows = blindSecretWriteReceiptRows({
      secretId: "sec_00000000000000000000000001" as never,
      secretVersionId: "sv_00000000000000000000000001" as never,
      variableKey: "APP_SECRET" as never,
      createdSecretShape: true,
    });
    expect(rows.map((row) => row.label)).toEqual(["Variable key", "Secret", "Version"]);
    expect(JSON.stringify(rows)).not.toContain(SENTINEL_VALUE);
  });
});
