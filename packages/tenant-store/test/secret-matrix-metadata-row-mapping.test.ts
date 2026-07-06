import { environmentId, secretId, type VariableKey } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  toLastSetActor,
  toSecretMatrixRow,
  type ProjectSecretJoinRow,
  type ResolvedSecretVersionRow,
} from "../src/secrets/secret-matrix-metadata-row-mapping.js";

const ENV = environmentId.brand("env_00000000000000000000000001");
const VARIABLE_KEY = "DATABASE_URL" as VariableKey;

function joinRow(overrides: Partial<ProjectSecretJoinRow> = {}): ProjectSecretJoinRow {
  return {
    secretId: "sec_00000000000000000000000001",
    environmentId: ENV,
    variableKey: VARIABLE_KEY,
    currentVersionId: null,
    liveVersionId: null,
    liveVersionNumberFromRow: null,
    liveLifecycleState: null,
    livePublishedAt: null,
    liveCreatedAt: null,
    ...overrides,
  };
}

describe("toLastSetActor", () => {
  it("returns null for machine actors without a machine identity id", () => {
    expect(
      toLastSetActor({
        actorType: "machine",
        actorUserId: null,
        actorMachineIdentityId: null,
      }),
    ).toBeNull();
  });

  it("preserves ci_exchange actors without relabeling malformed machine rows", () => {
    expect(
      toLastSetActor({
        actorType: "ci_exchange",
        actorUserId: null,
        actorMachineIdentityId: null,
      }),
    ).toEqual({
      actorType: "ci_exchange",
      userId: null,
      machineIdentityId: null,
    });
  });
});

describe("toSecretMatrixRow", () => {
  const draftVersion: ResolvedSecretVersionRow = {
    secretVersionId: "sv_00000000000000000000000002" as ResolvedSecretVersionRow["secretVersionId"],
    versionNumber: 1,
    lifecycleState: "draft",
    lastSetAt: new Date("2026-06-25T00:00:00.000Z"),
  };

  it("falls back to draft only when there is no live pointer", () => {
    const row = toSecretMatrixRow(
      joinRow({ secretId: "sec_00000000000000000000000002" }),
      new Map([["sec_00000000000000000000000002", draftVersion]]),
      new Map(),
    );

    expect(row).toMatchObject({
      secretId: secretId.brand("sec_00000000000000000000000002"),
      lifecycleState: "draft",
      versionNumber: 1,
    });
  });

  it("returns null when a live pointer exists but live metadata is malformed", () => {
    const row = toSecretMatrixRow(
      joinRow({
        currentVersionId: "secv_00000000000000000000000001",
        liveVersionId: "secv_00000000000000000000000001",
        liveVersionNumberFromRow: 2,
        liveLifecycleState: "live",
        livePublishedAt: new Date("2026-06-24T01:00:00.000Z"),
        liveCreatedAt: new Date("2026-06-24T00:00:00.000Z"),
      }),
      new Map([["sec_00000000000000000000000001", draftVersion]]),
      new Map(),
    );

    expect(row).toBeNull();
  });
});
