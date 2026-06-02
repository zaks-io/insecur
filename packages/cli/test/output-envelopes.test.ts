import { describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES, errorEnvelope, successEnvelope } from "@insecur/domain";
import { renderEnvelope } from "../src/output/render.js";
import { exitCodeForErrorCode } from "../src/output/exit-codes.js";
import { EXIT_AUTH_REQUIRED, EXIT_STEP_UP } from "../src/output/exit-codes.js";

describe("CLI output envelopes", () => {
  it("prints stable metadata-only JSON success", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    renderEnvelope(
      successEnvelope({ sessionId: "sess_test" }, { requestId: "req_test" as never }),
      { json: true, quiet: false },
      () => "unused",
    );
    const line = stdout.mock.calls[0]?.[0];
    expect(typeof line).toBe("string");
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toEqual({
      ok: true,
      data: { sessionId: "sess_test" },
      meta: { requestId: "req_test" },
    });
    stdout.mockRestore();
  });

  it("rejects forbidden sensitive keys in envelopes", () => {
    expect(() => successEnvelope({ token: "must-not-appear" } as never)).toThrow(/forbidden key/);
  });

  it("maps stable auth error codes to exit codes", () => {
    expect(exitCodeForErrorCode(AUTH_ERROR_CODES.required)).toBe(EXIT_AUTH_REQUIRED);
    expect(exitCodeForErrorCode(AUTH_ERROR_CODES.highAssuranceRequired)).toBe(EXIT_STEP_UP);
  });

  it("prints metadata-only JSON errors", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    renderEnvelope(
      errorEnvelope({
        code: AUTH_ERROR_CODES.required,
        message: "Authentication is required.",
        retryable: false,
      }),
      { json: true, quiet: false },
      () => "unused",
    );
    const line = stderr.mock.calls[0]?.[0];
    const parsed: unknown = JSON.parse(line as string);
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: "auth.required" },
    });
    stderr.mockRestore();
  });
});
