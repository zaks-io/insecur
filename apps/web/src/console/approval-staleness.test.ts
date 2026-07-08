import { describe, expect, it } from "vitest";
import { HIGH_ASSURANCE_CHALLENGE_FIXTURE } from "../components/approval-item.test.js";
import { approvalStalenessNotice } from "./approval-staleness.js";

describe("approvalStalenessNotice", () => {
  it("returns null for a pending challenge", () => {
    expect(
      approvalStalenessNotice({
        ...HIGH_ASSURANCE_CHALLENGE_FIXTURE,
        challengeId: "challenge-001",
        status: "pending",
        hasClearedEvidence: false,
      }),
    ).toBeNull();
  });

  it("describes expired and cleared states", () => {
    expect(
      approvalStalenessNotice({
        ...HIGH_ASSURANCE_CHALLENGE_FIXTURE,
        challengeId: "challenge-001",
        status: "expired",
        hasClearedEvidence: false,
      })?.headline,
    ).toBe("Challenge expired");
    expect(
      approvalStalenessNotice({
        ...HIGH_ASSURANCE_CHALLENGE_FIXTURE,
        challengeId: "challenge-001",
        status: "cleared",
        hasClearedEvidence: true,
      })?.headline,
    ).toBe("Already cleared");
  });
});
