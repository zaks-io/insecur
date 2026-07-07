import { describe, expect, it } from "vitest";
import { detectHarnessFromEnv } from "../src/detect-harness.js";
import { KNOWN_HARNESS_MARKERS } from "../src/harness-markers.js";

describe("KNOWN_HARNESS_MARKERS", () => {
  it("includes Claude Code and Cursor markers", () => {
    expect(KNOWN_HARNESS_MARKERS.CLAUDECODE.harnessCode).toBe("agent.harness.claude_code");
    expect(KNOWN_HARNESS_MARKERS.CURSOR_AGENT.harnessCode).toBe("agent.harness.cursor");
  });
});

describe("detectHarnessFromEnv", () => {
  it("detects Claude Code from CLAUDECODE=1", () => {
    expect(detectHarnessFromEnv({ CLAUDECODE: "1" })).toBe("agent.harness.claude_code");
  });

  it("detects Cursor from CURSOR_AGENT=1", () => {
    expect(detectHarnessFromEnv({ CURSOR_AGENT: "1" })).toBe("agent.harness.cursor");
  });

  it("detects Cursor from CURSOR_TRACE_ID when present", () => {
    expect(detectHarnessFromEnv({ CURSOR_TRACE_ID: "trace-abc" })).toBe("agent.harness.cursor");
  });

  it("returns undefined when no marker matches", () => {
    expect(detectHarnessFromEnv({})).toBeUndefined();
    expect(detectHarnessFromEnv({ CLAUDECODE: "0" })).toBeUndefined();
  });
});
