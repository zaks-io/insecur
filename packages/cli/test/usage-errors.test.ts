import { afterEach, describe, expect, it, vi } from "vitest";
import { CLI_ERROR_CODES } from "@insecur/domain";
import { runCli } from "../src/program.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";

describe("CLI usage errors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function captureOutput(): { stdout: string; stderr: string } {
    const stdout = { value: "" };
    const stderr = { value: "" };
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout.value += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr.value += String(chunk);
      return true;
    });
    return {
      get stdout() {
        return stdout.value;
      },
      get stderr() {
        return stderr.value;
      },
    };
  }

  describe("with --json", () => {
    it("returns a parseable envelope with structured remediation for a missing argument", async () => {
      const output = captureOutput();

      const exitCode = await runCli(["node", "insecur", "secrets", "set", "--json"]);

      expect(exitCode).toBe(EXIT_VALIDATION);
      const parsed = JSON.parse(output.stderr) as {
        ok: boolean;
        error: { code: string; message: string; retryable: boolean };
        remediation?: { type?: string; suggestedFix?: string; usage?: readonly string[] };
      };
      expect(parsed).toMatchObject({
        ok: false,
        error: {
          code: CLI_ERROR_CODES.validationError,
          message: expect.stringContaining("missing required argument 'variable-key'"),
          retryable: false,
        },
      });
      // The agent-facing recovery is machine-readable: a stable type URI, a fix,
      // and the exact corrected invocation to run next.
      expect(parsed.remediation?.type).toBe("https://insecur.dev/errors/cli-validation-error");
      expect(parsed.remediation?.suggestedFix).toContain("missing required argument");
      expect(parsed.remediation?.usage).toEqual(["insecur", "secrets", "set", "<variable-key>"]);
      expect(output.stdout).toBe("");
    });

    it("returns a parseable envelope for an unknown command", async () => {
      const output = captureOutput();

      const exitCode = await runCli(["node", "insecur", "bogus", "--json"]);

      expect(exitCode).toBe(EXIT_VALIDATION);
      const parsed = JSON.parse(output.stderr) as {
        ok: boolean;
        error: { code: string; message: string; retryable: boolean };
      };
      expect(parsed).toMatchObject({
        ok: false,
        error: {
          code: CLI_ERROR_CODES.validationError,
          message: expect.stringContaining("unknown command 'bogus'"),
          retryable: false,
        },
      });
      expect(output.stdout).toBe("");
    });

    it("returns a parseable envelope for an unknown option", async () => {
      const output = captureOutput();

      const exitCode = await runCli([
        "node",
        "insecur",
        "secrets",
        "set",
        "API_KEY",
        "--nope",
        "--json",
      ]);

      expect(exitCode).toBe(EXIT_VALIDATION);
      const parsed = JSON.parse(output.stderr) as {
        ok: boolean;
        error: { code: string; message: string; retryable: boolean };
      };
      expect(parsed).toMatchObject({
        ok: false,
        error: {
          code: CLI_ERROR_CODES.validationError,
          message: "unknown option '--nope'",
          retryable: false,
        },
      });
      expect(output.stdout).toBe("");
    });

    it("renders a clean envelope when a malformed global --env-id fails parsing", async () => {
      const output = captureOutput();

      // A bad --env-id throws while the failure renderer resolves flags; the
      // renderer must select JSON mode without re-throwing on the same bad flag.
      const exitCode = await runCli([
        "node",
        "insecur",
        "secrets",
        "list",
        "--env-id",
        "env_x",
        "--json",
      ]);

      expect(exitCode).toBe(EXIT_VALIDATION);
      const parsed = JSON.parse(output.stderr) as { ok: boolean; error: { code: string } };
      expect(parsed.ok).toBe(false);
      expect(parsed.error.code).toBe("validation.invalid_opaque_resource_id");
      expect(output.stdout).toBe("");
    });
  });

  describe("without --json", () => {
    it("writes an actionable fix line to stderr for a missing argument", async () => {
      const output = captureOutput();

      const exitCode = await runCli(["node", "insecur", "secrets", "set"]);

      expect(exitCode).toBe(EXIT_VALIDATION);
      expect(output.stderr).toContain("✗ missing required argument 'variable-key'");
      expect(output.stderr).toContain("→");
      expect(output.stdout).toBe("");
      expect(output.stderr).not.toContain('"ok"');
    });

    it("writes prose to stderr for an unknown command", async () => {
      const output = captureOutput();

      const exitCode = await runCli(["node", "insecur", "bogus"]);

      expect(exitCode).toBe(EXIT_VALIDATION);
      expect(output.stderr).toContain("unknown command 'bogus'");
      expect(output.stdout).toBe("");
      expect(output.stderr).not.toContain('"ok"');
    });

    it("writes prose to stderr for an unknown option", async () => {
      const output = captureOutput();

      const exitCode = await runCli(["node", "insecur", "secrets", "set", "API_KEY", "--nope"]);

      expect(exitCode).toBe(EXIT_VALIDATION);
      expect(output.stderr).toContain("✗ unknown option '--nope'");
      expect(output.stdout).toBe("");
      expect(output.stderr).not.toContain('"ok"');
    });
  });

  describe("commander success exits", () => {
    it("exits 0 for --version without an error envelope", async () => {
      const output = captureOutput();

      const exitCode = await runCli(["node", "insecur", "--version"]);

      expect(exitCode).toBe(0);
      expect(output.stdout).toMatch(/\d+\.\d+\.\d+/);
      expect(output.stderr).toBe("");
      expect(output.stderr).not.toContain('"ok"');
    });

    it("exits 0 for --help without an error envelope", async () => {
      const output = captureOutput();

      const exitCode = await runCli(["node", "insecur", "--help"]);

      expect(exitCode).toBe(0);
      expect(output.stdout).toContain("Usage: insecur");
      expect(output.stderr).toBe("");
      expect(output.stderr).not.toContain('"ok"');
    });

    it("exits 0 for --version --json without an error envelope", async () => {
      const output = captureOutput();

      const exitCode = await runCli(["node", "insecur", "--version", "--json"]);

      expect(exitCode).toBe(0);
      expect(output.stdout).toMatch(/\d+\.\d+\.\d+/);
      expect(output.stderr).toBe("");
      expect(output.stderr).not.toContain('"ok":false');
    });

    it("exits 0 for --help --json without an error envelope", async () => {
      const output = captureOutput();

      const exitCode = await runCli(["node", "insecur", "--help", "--json"]);

      expect(exitCode).toBe(0);
      expect(output.stdout).toContain("Usage: insecur");
      expect(output.stderr).toBe("");
      expect(output.stderr).not.toContain('"ok":false');
    });
  });
});
