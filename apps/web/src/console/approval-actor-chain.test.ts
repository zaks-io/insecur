import { describe, expect, it } from "vitest";
import { formatApprovalActorChainLabel } from "./approval-actor-chain.js";

describe("formatApprovalActorChainLabel", () => {
  it("renders a machine identity without CI run metadata", () => {
    expect(
      formatApprovalActorChainLabel({
        requestingUserId: null,
        requestingMachineIdentityId: "mach_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      }),
    ).toBe("mach_01JZ8E2QYQAAAAAAAAAAAAAAAA");
  });

  it("renders a CI principal chain when githubRunId is present", () => {
    expect(
      formatApprovalActorChainLabel({
        requestingUserId: null,
        requestingMachineIdentityId: "mach_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        details: { githubRunId: "run_123" },
      }),
    ).toBe("run_123 · mach_01JZ8E2QYQAAAAAAAAAAAAAAAA");
  });

  it("renders an agent session chain under a human user", () => {
    expect(
      formatApprovalActorChainLabel({
        requestingUserId: "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
        requestingMachineIdentityId: null,
        details: {
          agentSessionId: "ags_01JZ8E2QYQAAAAAAAAAAAAAAAA",
          harnessName: "agent.harness.cursor",
        },
      }),
    ).toBe("agent ags_01JZ8E2QYQAAAAAAAAAAAAAAAA (cursor) · under usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
  });
});
