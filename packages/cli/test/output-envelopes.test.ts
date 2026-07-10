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
      schemaVersion: "1",
      ok: true,
      data: { sessionId: "sess_test" },
      meta: { requestId: "req_test" },
    });
    stdout.mockRestore();
  });

  it("prints ordered machine-executable next actions", () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    renderEnvelope(
      successEnvelope({ status: "ready" }, undefined, [
        {
          id: "run-proof",
          actor: "agent",
          kind: "execute",
          argv: ["insecur", "run", "--variable-key", "INSECUR_PROOF_SECRET", "--", "node"],
        },
      ]),
      { json: true, quiet: false },
      () => "unused",
    );

    const parsed = JSON.parse(String(stdout.mock.calls[0]?.[0])) as {
      next: { id: string; actor: string; kind: string; argv: string[] }[];
    };
    expect(parsed.next).toEqual([
      {
        id: "run-proof",
        actor: "agent",
        kind: "execute",
        argv: ["insecur", "run", "--variable-key", "INSECUR_PROOF_SECRET", "--", "node"],
      },
    ]);
    stdout.mockRestore();
  });

  it("rejects forbidden sensitive keys in envelopes", () => {
    expect(() => successEnvelope({ token: "must-not-appear" } as never)).toThrow(/forbidden key/);
  });

  it("maps stable auth error codes to exit codes", () => {
    expect(exitCodeForErrorCode(AUTH_ERROR_CODES.required)).toBe(EXIT_AUTH_REQUIRED);
    expect(exitCodeForErrorCode(AUTH_ERROR_CODES.highAssuranceRequired)).toBe(EXIT_STEP_UP);
  });

  it("prints remediation steps in prose mode", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    renderEnvelope(
      errorEnvelope(
        {
          code: AUTH_ERROR_CODES.required,
          message: "Authentication is required.",
          retryable: false,
        },
        { remediation: { login: ["insecur", "login"] } },
      ),
      { json: false, quiet: false },
      () => "unused",
    );
    const output = stderr.mock.calls.map((call) => call[0]).join("");
    expect(output).toContain("Authentication is required.");
    expect(output).toContain("Run insecur login");
    stderr.mockRestore();
  });

  it("prints metadata-only JSON errors with remediation", () => {
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
      schemaVersion: "1",
      ok: false,
      error: { code: "auth.required" },
    });
    stderr.mockRestore();
  });

  it("projects remediation into ordered actor-aware next actions", () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    renderEnvelope(
      errorEnvelope(
        {
          code: AUTH_ERROR_CODES.highAssuranceRequired,
          message: "Human approval required.",
          retryable: false,
        },
        {
          remediation: {
            approvalUrl: "https://app.insecur.test/approvals/op_test",
            poll: ["insecur", "operations", "wait", "op_test", "--json"],
            resume: ["insecur", "operations", "resume", "op_test", "--json"],
          },
        },
      ),
      { json: true, quiet: false },
      () => "unused",
    );

    const parsed = JSON.parse(String(stderr.mock.calls[0]?.[0])) as {
      next: { actor: string; kind: string }[];
    };
    expect(parsed.next.map(({ actor, kind }) => ({ actor, kind }))).toEqual([
      { actor: "human", kind: "open_url" },
      { actor: "agent", kind: "wait" },
      { actor: "agent", kind: "execute" },
    ]);
    stderr.mockRestore();
  });
});
