import { describe, expect, it } from "vitest";
import { formatPrincipalChainActorLabel, formatUserActorChainLabel } from "./actor-chain-label.js";

describe("formatUserActorChainLabel", () => {
  it("renders a bare human user id", () => {
    expect(formatUserActorChainLabel("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E", undefined)).toBe(
      "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
    );
  });

  it("renders an agent session chain under a human user", () => {
    expect(
      formatUserActorChainLabel("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E", {
        agentSessionId: "ags_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        harnessName: "agent.harness.cursor",
      }),
    ).toBe("agent ags_01JZ8E2QYQAAAAAAAAAAAAAAAA (cursor) · under usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
  });

  it("renders a self-reported harness tag as unverified", () => {
    expect(
      formatUserActorChainLabel("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E", {
        agentAttributionTag: "cursor",
      }),
    ).toBe("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E · via cursor (unverified)");
  });
});

describe("formatPrincipalChainActorLabel", () => {
  it("renders CI as run · machine identity", () => {
    expect(
      formatPrincipalChainActorLabel({
        actorType: "machine",
        machineIdentityId: "mach_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        details: { githubRunId: "run_123" },
      }),
    ).toBe("run_123 · mach_01JZ8E2QYQAAAAAAAAAAAAAAAA");
  });

  it("renders ci_exchange without a bare robot identity", () => {
    expect(formatPrincipalChainActorLabel({ actorType: "ci_exchange" })).toBe("ci_exchange");
  });
});
