import { describe, expect, it, vi } from "vitest";
import { errorEnvelope, STORE_ERROR_CODES } from "@insecur/domain";
import type { GlobalCliFlags } from "../src/cli-options.js";
import { handleApiFailure } from "../src/commands/api-failure.js";
import { EXIT_UNEXPECTED } from "../src/output/exit-codes.js";

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
  it("in --json mode renders the envelope and returns the retryable-aware exit code instead of throwing", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    // store.unavailable defaults to the retryable exit code, but this occurrence is marked
    // non-retryable (e.g. a mid-flight connection loss) — the exit code must downgrade to match.
    const envelope = errorEnvelope({
      code: STORE_ERROR_CODES.unavailable,
      message: "The store connection was lost mid-flight.",
      retryable: false,
    });

    const exitCode = handleApiFailure(envelope, { ...baseFlags, json: true });

    expect(exitCode).toBe(EXIT_UNEXPECTED);
    const line = stderr.mock.calls[0]?.[0];
    expect(typeof line).toBe("string");
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: "store.unavailable", retryable: false },
    });
    stderr.mockRestore();
  });

  it("in --json mode returns the retryable exit code when the occurrence is still retryable", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const envelope = errorEnvelope({
      code: STORE_ERROR_CODES.unavailable,
      message: "The store is temporarily unavailable.",
      retryable: true,
    });

    const exitCode = handleApiFailure(envelope, { ...baseFlags, json: true });

    expect(exitCode).toBe(8);
    stderr.mockRestore();
  });

  it("outside of --json mode throws a CliError built from the envelope instead of returning an exit code", () => {
    const envelope = errorEnvelope({
      code: STORE_ERROR_CODES.unavailable,
      message: "The store connection was lost mid-flight.",
      retryable: false,
    });

    let thrown: unknown;
    try {
      handleApiFailure(envelope, { ...baseFlags, json: false });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: "CliError",
      message: "The store connection was lost mid-flight.",
      exitCode: EXIT_UNEXPECTED,
    });
  });
});