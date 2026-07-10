import { describe, expect, it, vi } from "vitest";
import { CLI_ERROR_CODES, LOCAL_ERROR_CODES, errorEnvelope } from "@insecur/domain";
import { KEY_STORE_ERROR_CODES, KeyStoreError } from "@insecur/local-store";
import { NOOP_CRASH_REPORTER } from "../src/crash-reporting.js";
import { EXIT_ACTION_REQUIRED } from "../src/output/exit-codes.js";
import { renderCliRunFailure } from "../src/output/render-cli-run-failure.js";
import {
  logUnexpectedCliErrorDebug,
  unexpectedCliErrorBody,
} from "../src/output/unexpected-cli-error.js";
import { renderEnvelope } from "../src/output/render.js";

const SENTINEL = "sentinel-plaintext-must-not-reach-terminal";

describe("unexpected CLI error sanitization", () => {
  it("returns a fixed generic message without trusting the mutable error name", () => {
    const error = new Error(SENTINEL);
    error.name = SENTINEL;
    const body = unexpectedCliErrorBody(error);
    expect(body).toEqual({
      code: CLI_ERROR_CODES.unexpectedError,
      message: "Unexpected CLI failure (Error)",
      retryable: false,
    });
    expect(body.message).not.toContain(SENTINEL);
  });

  it("never writes raw error detail, including in verbose mode", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const error = new Error(SENTINEL);
    error.name = SENTINEL;

    try {
      logUnexpectedCliErrorDebug(error, false);
      expect(stderr).not.toHaveBeenCalled();

      logUnexpectedCliErrorDebug(error, true);
      const output = stderr.mock.calls.map((call) => String(call[0])).join("");
      expect(output).not.toContain(SENTINEL);
      expect(output).toContain("[debug]");
      expect(output).toContain("raw exception detail suppressed");
    } finally {
      stderr.mockRestore();
    }
  });

  it("renders sanitized envelope output without the raw message", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const error = new Error(SENTINEL);
    error.name = SENTINEL;

    try {
      renderEnvelope(errorEnvelope(unexpectedCliErrorBody(error)), { json: false, quiet: false });
      const output = stderr.mock.calls.map((call) => String(call[0])).join("");
      expect(output).toContain("Unexpected CLI failure (Error)");
      expect(output).not.toContain(SENTINEL);
    } finally {
      stderr.mockRestore();
    }
  });

  it("renders actionable fail-closed guidance when no OS credential store is available", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const exitCode = await renderCliRunFailure(
        new KeyStoreError(KEY_STORE_ERROR_CODES.unavailable, SENTINEL),
        { json: true, quiet: false, verbose: false },
        NOOP_CRASH_REPORTER,
      );
      expect(exitCode).toBe(EXIT_ACTION_REQUIRED);
      const output = stderr.mock.calls.map((call) => String(call[0])).join("");
      expect(output).not.toContain(SENTINEL);
      expect(JSON.parse(output)).toMatchObject({
        ok: false,
        error: { code: LOCAL_ERROR_CODES.keyStoreUnavailable },
        remediation: {
          suggestedFix: expect.stringContaining("INSECUR_ALLOW_INSECURE_FILE_KEYSTORE=1"),
        },
      });
    } finally {
      stderr.mockRestore();
    }
  });
});
