import { describe, expect, it } from "vitest";
import { isTransitionAllowed, TERMINAL_OPERATION_STATES } from "../src/operation-states.js";

describe("operation state transitions", () => {
  it("allows forward progress from pending and running", () => {
    expect(isTransitionAllowed("pending", "running")).toBe(true);
    expect(isTransitionAllowed("running", "incomplete")).toBe(true);
    expect(isTransitionAllowed("incomplete", "running")).toBe(true);
  });

  it("rejects backward transitions", () => {
    expect(isTransitionAllowed("running", "pending")).toBe(false);
    expect(isTransitionAllowed("succeeded", "running")).toBe(false);
    expect(isTransitionAllowed("failed", "incomplete")).toBe(false);
  });

  it("treats terminal states as immobile", () => {
    for (const state of TERMINAL_OPERATION_STATES) {
      expect(isTransitionAllowed(state, "running")).toBe(false);
      expect(isTransitionAllowed(state, "pending")).toBe(false);
    }
  });
});
