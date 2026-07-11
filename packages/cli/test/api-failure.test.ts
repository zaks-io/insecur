import { AUTH_ERROR_CODES, STORE_ERROR_CODES, errorEnvelope } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";
import type { GlobalCliFlags } from "../src/cli-options.js";
import { handleApiFailure } from "../src/commands/api-failure.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_FORBIDDEN, EXIT_UNEXPECTED } from "../src/output/exit-codes.js";

const baseFlags: GlobalCliFlags = {
  host: undefined,
  orgId: undefined,
  projectId: undefined,
  envId: undefined,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  agent: undefined,
  json: false,
  quiet: false,
  verbose: false,
  color: undefined,
  full: false,
};

describe("handleApiFailure", () => {
  it("throws a CliError carrying the envelope's error body in human (non-JSON) mode", () => {
    const envelope = errorEnvelope({
      code: AUTH_ERROR_CODES.insufficientScope,
      message: "You do not have access.",
      retryable: false,
    });

    let thrown: unknown;
    try {
      handleApiFailure(envelope, { ...baseFlags, json: false });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CliError);
    expect((thrown as CliError).code).toBe(AUTH_ERROR_CODES.insufficientScope);
    expect((thrown as CliError).exitCode).toBe(EXIT_FORBIDDEN);
  });

  it("renders a JSON error envelope to stderr and returns the mapped exit code without throwing", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const envelope = errorEnvelope({
        code: AUTH_ERROR_CODES.insufficientScope,
        message: "You do not have access.",
        retryable: false,
      });

      const exitCode = handleApiFailure(envelope, { ...baseFlags, json: true });

      expect(exitCode).toBe(EXIT_FORBIDDEN);
      const output = stderr.mock.calls.map((call) => String(call[0])).join("");
      expect(JSON.parse(output)).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.insufficientScope },
      });
    } finally {
      stderr.mockRestore();
    }
  });

  it("downgrades a retryable-by-default code to the unexpected exit code when this occurrence is non-retryable", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const envelope = errorEnvelope({
        code: STORE_ERROR_CODES.unavailable,
        message: "The store is temporarily unavailable.",
        retryable: false,
      });

      const exitCode = handleApiFailure(envelope, { ...baseFlags, json: true });

      expect(exitCode).toBe(EXIT_UNEXPECTED);
    } finally {
      stderr.mockRestore();
    }
  });

  it("keeps the default retryable exit code when store.unavailable is actually retryable", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const envelope = errorEnvelope({
        code: STORE_ERROR_CODES.unavailable,
        message: "The store is temporarily unavailable.",
        retryable: true,
      });

      const exitCode = handleApiFailure(envelope, { ...baseFlags, json: true });

      // 8 is the stable EXIT_RETRYABLE code (docs/cli-and-sync.md); it is intentionally not
      // exported from exit-codes.ts, so exit-codes.test.ts also asserts on the literal.
      expect(exitCode).toBe(8);
    } finally {
      stderr.mockRestore();
    }
  });
});