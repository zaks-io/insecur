import { describe, expect, it } from "vitest";

import { principalChainActorFromAuditRow } from "../src/secrets/principal-chain-actor-from-audit.js";

describe("principalChainActorFromAuditRow", () => {
  it("renders an agent session chain from audit details", () => {
    expect(
      principalChainActorFromAuditRow({
        actorType: "user",
        actorUserId: "usr_00000000000000000000000011",
        actorMachineIdentityId: null,
        details: {
          agentSessionId: "ags_00000000000000000000000011",
          harnessName: "agent.harness.cursor",
        },
      }),
    ).toEqual({
      actorType: "user",
      userId: "usr_00000000000000000000000011",
      machineIdentityId: null,
      details: {
        agentSessionId: "ags_00000000000000000000000011",
        harnessName: "agent.harness.cursor",
      },
    });
  });

  it("renders CI attribution with githubRunId details", () => {
    expect(
      principalChainActorFromAuditRow({
        actorType: "machine",
        actorUserId: null,
        actorMachineIdentityId: "mach_00000000000000000000000011",
        details: { githubRunId: "run_123" },
      }),
    ).toEqual({
      actorType: "machine",
      userId: null,
      machineIdentityId: "mach_00000000000000000000000011",
      details: { githubRunId: "run_123" },
    });
  });

  it("skips malformed machine audit rows without an identity id", () => {
    expect(
      principalChainActorFromAuditRow({
        actorType: "machine",
        actorUserId: null,
        actorMachineIdentityId: null,
        details: null,
      }),
    ).toBeNull();
  });
});
