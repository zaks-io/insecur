import { describe, expect, it, vi } from "vitest";
import { errorEnvelope } from "@insecur/domain";
import {
  logUnexpectedCliErrorDebug,
  unexpectedCliErrorBody,
} from "../src/output/unexpected-cli-error.js";
import { renderEnvelope } from "../src/output/render.js";

const SENTINEL = "sentinel-plaintext-must-not-reach-terminal";

describe("unexpected CLI error sanitization", () => {
  it("returns a fixed generic message with only the error name", () => {
    const body = unexpectedCliErrorBody(new Error(SENTINEL));
    expect(body).toEqual({
      code: "cli.unexpected_error",
      message: "Unexpected CLI failure (Error)",
      retryable: false,
    });
    expect(body.message).not.toContain(SENTINEL);
  });

  it("does not write raw error detail unless verbose is enabled", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const error = new Error(SENTINEL);

    try {
      logUnexpectedCliErrorDebug(error, false);
      expect(stderr).not.toHaveBeenCalled();

      logUnexpectedCliErrorDebug(error, true);
      const output = stderr.mock.calls.map((call) => String(call[0])).join("");
      expect(output).toContain(SENTINEL);
      expect(output).toContain("[debug]");
    } finally {
      stderr.mockRestore();
    }
  });

  it("renders sanitized envelope output without the raw message", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const error = new Error(SENTINEL);

    try {
      renderEnvelope(errorEnvelope(unexpectedCliErrorBody(error)), { json: false, quiet: false });
      const output = stderr.mock.calls.map((call) => String(call[0])).join("");
      expect(output).toContain("Unexpected CLI failure (Error)");
      expect(output).not.toContain(SENTINEL);
    } finally {
      stderr.mockRestore();
    }
  });
});
