import { describe, expect, it } from "vitest";

import {
  isProtectedChangeTransitionAllowed,
  TERMINAL_PROTECTED_CHANGE_STATES,
} from "../src/protected-change-states.js";

describe("protected change state transitions", () => {
  it("allows the documented promotion approval and execution flow", () => {
    expect(isProtectedChangeTransitionAllowed("proposed", "pending_approval")).toBe(true);
    expect(isProtectedChangeTransitionAllowed("pending_approval", "approved")).toBe(true);
    expect(isProtectedChangeTransitionAllowed("approved", "executing")).toBe(true);
    expect(isProtectedChangeTransitionAllowed("executing", "succeeded")).toBe(true);
    expect(isProtectedChangeTransitionAllowed("executing", "failed")).toBe(true);
  });

  it("allows terminal closures from pending approval", () => {
    expect(isProtectedChangeTransitionAllowed("pending_approval", "rejected")).toBe(true);
    expect(isProtectedChangeTransitionAllowed("pending_approval", "stale")).toBe(true);
    expect(isProtectedChangeTransitionAllowed("pending_approval", "canceled")).toBe(true);
    expect(isProtectedChangeTransitionAllowed("proposed", "canceled")).toBe(true);
  });

  it("rejects backward and skipped transitions", () => {
    expect(isProtectedChangeTransitionAllowed("pending_approval", "executing")).toBe(false);
    expect(isProtectedChangeTransitionAllowed("approved", "pending_approval")).toBe(false);
    expect(isProtectedChangeTransitionAllowed("succeeded", "executing")).toBe(false);
    expect(isProtectedChangeTransitionAllowed("rejected", "pending_approval")).toBe(false);
  });

  it("treats terminal states as immobile", () => {
    for (const state of TERMINAL_PROTECTED_CHANGE_STATES) {
      expect(isProtectedChangeTransitionAllowed(state, "pending_approval")).toBe(false);
      expect(isProtectedChangeTransitionAllowed(state, "executing")).toBe(false);
    }
  });
});
