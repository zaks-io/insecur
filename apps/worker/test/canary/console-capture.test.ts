import { describe, expect, it } from "vitest";
import { startConsoleCapture } from "./console-capture.js";
import { mintCanarySentinel } from "./sentinel-encodings.js";
import { sweepTextOutput } from "./postgres-sweep.js";

describe("console capture", () => {
  it("detects a sentinel embedded in console.error(new Error(...))", () => {
    const sentinel = mintCanarySentinel();
    const capture = startConsoleCapture({ forward: false });

    try {
      console.error(new Error(`wrapped leak: ${sentinel.value}`));
    } finally {
      capture.stop();
    }

    const hits = sweepTextOutput(capture.output, sentinel);
    expect(hits.some((hit) => hit.surface === "console" && hit.encoding === "raw")).toBe(true);
  });
});
