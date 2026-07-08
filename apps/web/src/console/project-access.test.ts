import { describe, expect, it } from "vitest";

import {
  parseProjectInjectionGrantsBody,
  parseProjectMachineIdentitiesBody,
  type ConsoleInjectionGrant,
  type ConsoleMachineIdentity,
} from "./project-access.js";

const MACHINE_IDENTITY: ConsoleMachineIdentity = {
  machineIdentityId: "mach_00000000000000000000000001",
  displayName: "CI deploy",
  status: "active",
  createdAt: "2026-06-24T00:00:00.000Z",
  githubActionsOidcMethods: [
    {
      authMethodId: "oidc_00000000000000000000000001",
      environmentId: "env_00000000000000000000000001",
      githubRepository: "zaks-io/insecur",
      githubEnvironment: "production",
      status: "active",
      createdAt: "2026-06-24T00:00:00.000Z",
    },
  ],
  environmentDeployKeyMethods: [
    {
      authMethodId: "edk_00000000000000000000000001",
      environmentId: "env_00000000000000000000000001",
      status: "active",
      nonExpiring: false,
      expiresAt: "2026-12-31T00:00:00.000Z",
      rotationIntervalSeconds: 86_400,
      rotationReminderIntervalSeconds: 7_200,
      createdAt: "2026-06-24T00:00:00.000Z",
    },
  ],
};

const GRANT: ConsoleInjectionGrant = {
  grantId: "igr_00000000000000000000000001",
  environmentId: "env_00000000000000000000000001",
  variableKeys: ["DATABASE_URL"],
  status: "consumed",
  createdAt: "2026-06-24T00:00:00.000Z",
  expiresAt: "2026-06-24T00:05:00.000Z",
  consumedAt: "2026-06-24T00:01:00.000Z",
  issuedByActor: {
    actorType: "user",
    userId: "usr_00000000000000000000000001",
    details: {
      agentSessionId: "ags_00000000000000000000000011",
      harnessName: "cursor",
    },
  },
  consumedByActor: {
    actorType: "machine",
    machineIdentityId: "mach_00000000000000000000000001",
    details: {
      githubRunId: "1234567890",
    },
  },
};

describe("parseProjectMachineIdentitiesBody", () => {
  it("parses a metadata-only machine identity list", () => {
    expect(
      parseProjectMachineIdentitiesBody({
        ok: true,
        data: { machineIdentities: [MACHINE_IDENTITY] },
      }),
    ).toEqual([MACHINE_IDENTITY]);
  });

  it("ignores unknown credential-material fields on auth methods", () => {
    const parsed = parseProjectMachineIdentitiesBody({
      ok: true,
      data: {
        machineIdentities: [
          {
            ...MACHINE_IDENTITY,
            environmentDeployKeyMethods: [
              {
                ...MACHINE_IDENTITY.environmentDeployKeyMethods[0],
                secretHashB64: "must-not-surface",
              },
            ],
          },
        ],
      },
    });
    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toMatch(/secretHash|secret_hash/i);
  });

  it("fails closed on malformed envelopes", () => {
    expect(parseProjectMachineIdentitiesBody({ ok: false })).toBeNull();
    expect(parseProjectMachineIdentitiesBody(undefined)).toBeNull();
  });
});

describe("parseProjectInjectionGrantsBody", () => {
  it("parses grant history with principal-chain attribution", () => {
    expect(
      parseProjectInjectionGrantsBody({
        ok: true,
        data: { grants: [GRANT] },
      }),
    ).toEqual([GRANT]);
  });

  it("ignores unknown token-material fields on grants", () => {
    const parsed = parseProjectInjectionGrantsBody({
      ok: true,
      data: {
        grants: [{ ...GRANT, token: "must-not-surface" }],
      },
    });
    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toMatch(/"token"/i);
  });

  it("fails closed on malformed envelopes", () => {
    expect(parseProjectInjectionGrantsBody({ ok: false })).toBeNull();
    expect(parseProjectInjectionGrantsBody(undefined)).toBeNull();
  });

  it("parses revoked grants with optional lifecycle timestamps", () => {
    expect(
      parseProjectInjectionGrantsBody({
        ok: true,
        data: {
          grants: [
            {
              ...GRANT,
              status: "revoked",
              consumedAt: undefined,
              revokedAt: "2026-06-24T00:02:00.000Z",
              revokedReason: "tenant_suspension",
              issuedByActor: undefined,
              consumedByActor: undefined,
            },
          ],
        },
      }),
    ).toEqual([
      {
        grantId: GRANT.grantId,
        environmentId: GRANT.environmentId,
        variableKeys: GRANT.variableKeys,
        status: "revoked",
        createdAt: GRANT.createdAt,
        expiresAt: GRANT.expiresAt,
        revokedAt: "2026-06-24T00:02:00.000Z",
        revokedReason: "tenant_suspension",
      },
    ]);
  });
});
