import { describe, expect, it } from "vitest";
import type { ConsoleEnvironment } from "./projects.js";
import {
  parseProjectSecretsBody,
  secretMatrixRowHasDrift,
  type ConsoleSecretsMatrix,
} from "./secrets-matrix.js";

const ENV_STAGING: ConsoleEnvironment = {
  environmentId: "env_01JZ8E4R2P7M9N3K5T8V1X6Z0A",
  displayName: "staging",
  lifecycleStage: "staging",
  isProtected: false,
  createdAt: "2026-07-01T00:00:00.000Z",
};

const ENV_PRODUCTION: ConsoleEnvironment = {
  environmentId: "env_01JZ8E5R2P7M9N3K5T8V1X6Z0B",
  displayName: "production",
  lifecycleStage: "production",
  isProtected: true,
  createdAt: "2026-07-01T00:00:00.000Z",
};

const MATRIX: ConsoleSecretsMatrix = {
  environments: [ENV_STAGING, ENV_PRODUCTION],
  rows: [
    {
      variableKey: "DATABASE_URL",
      cells: [
        {
          environmentId: ENV_STAGING.environmentId,
          present: true,
          secretId: "sec_00000000000000000000000001",
          versionNumber: 1,
          secretVersionId: "sv_00000000000000000000000001",
          lifecycleState: "live",
          lastSetAt: "2026-06-24T01:00:00.000Z",
          lastSetActor: { actorType: "user", userId: "usr_00000000000000000000000011" },
        },
        {
          environmentId: ENV_PRODUCTION.environmentId,
          present: true,
          secretId: "sec_00000000000000000000000002",
          versionNumber: 3,
          secretVersionId: "sv_00000000000000000000000002",
          lifecycleState: "live",
          lastSetAt: "2026-06-25T01:00:00.000Z",
          lastSetActor: { actorType: "user", userId: "usr_00000000000000000000000011" },
        },
      ],
    },
  ],
};

describe("parseProjectSecretsBody", () => {
  it("parses the success envelope into metadata-only matrix rows", () => {
    expect(parseProjectSecretsBody({ ok: true, data: MATRIX })).toEqual(MATRIX);
  });

  it("parses an empty matrix as a valid authorized read", () => {
    expect(
      parseProjectSecretsBody({
        ok: true,
        data: { environments: [ENV_STAGING], rows: [] },
      }),
    ).toEqual({ environments: [ENV_STAGING], rows: [] });
  });

  it("fails closed on error envelopes so denial reads as nonexistence", () => {
    expect(parseProjectSecretsBody({ ok: false, error: { code: "auth.forbidden" } })).toBeNull();
    expect(parseProjectSecretsBody(undefined)).toBeNull();
    expect(parseProjectSecretsBody({ ok: true, data: {} })).toBeNull();
  });

  it("rejects absent cells that carry value-shaped fields", () => {
    const parsed = parseProjectSecretsBody({
      ok: true,
      data: {
        environments: [ENV_STAGING],
        rows: [
          {
            variableKey: "DATABASE_URL",
            cells: [{ environmentId: ENV_STAGING.environmentId, present: false, value: "nope" }],
          },
        ],
      },
    });
    expect(parsed).toEqual({
      environments: [ENV_STAGING],
      rows: [
        {
          variableKey: "DATABASE_URL",
          cells: [{ environmentId: ENV_STAGING.environmentId, present: false }],
        },
      ],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/"value"/u);
  });
});

describe("secretMatrixRowHasDrift", () => {
  it("detects version drift across environments", () => {
    const row = MATRIX.rows[0];
    expect(row).toBeDefined();
    if (row !== undefined) {
      expect(secretMatrixRowHasDrift(row)).toBe(true);
    }
  });

  it("detects missing secrets as drift", () => {
    expect(
      secretMatrixRowHasDrift({
        variableKey: "API_KEY",
        cells: [
          { environmentId: ENV_STAGING.environmentId, present: true, versionNumber: 1 },
          { environmentId: ENV_PRODUCTION.environmentId, present: false },
        ],
      }),
    ).toBe(true);
  });

  it("reports no drift when every present cell shares the same version", () => {
    expect(
      secretMatrixRowHasDrift({
        variableKey: "API_KEY",
        cells: [
          {
            environmentId: ENV_STAGING.environmentId,
            present: true,
            versionNumber: 2,
          },
          {
            environmentId: ENV_PRODUCTION.environmentId,
            present: true,
            versionNumber: 2,
          },
        ],
      }),
    ).toBe(false);
  });
});
