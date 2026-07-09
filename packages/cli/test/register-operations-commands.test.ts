import { describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import {
  parseOperationsWaitTimeout,
  registerOperationsCommands,
} from "../src/register-operations-commands.js";
import { attachGlobalOptions, globalFlags } from "../src/program-deps.js";
import { EXIT_VALIDATION } from "../src/output/exit-codes.js";
import { CliError } from "../src/output/cli-error.js";

const runOperationsGetCommandMock = vi.hoisted(() => vi.fn(async () => 0));
const runOperationsWaitCommandMock = vi.hoisted(() => vi.fn(async () => 0));
const runOperationsCancelCommandMock = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("../src/commands/operations-get.js", () => ({
  runOperationsGetCommand: runOperationsGetCommandMock,
}));

vi.mock("../src/commands/operations-wait.js", () => ({
  runOperationsWaitCommand: runOperationsWaitCommandMock,
}));

vi.mock("../src/commands/operations-cancel.js", () => ({
  runOperationsCancelCommand: runOperationsCancelCommandMock,
}));

describe("parseOperationsWaitTimeout", () => {
  it.each(["1", "60", "600", "999999"])("accepts valid timeout %s", (value) => {
    expect(parseOperationsWaitTimeout(value)).toBe(Number(value));
  });

  it("preserves an omitted timeout", () => {
    expect(parseOperationsWaitTimeout(undefined)).toBeUndefined();
  });

  it.each(["0", "-1", "5m", "abc", "60abc", "1.5", ""])("rejects invalid timeout %s", (value) => {
    expect(() => parseOperationsWaitTimeout(value)).toThrow(/--timeout/);
  });

  it("fails closed at exit 2 for invalid timeout", () => {
    try {
      parseOperationsWaitTimeout("5m");
      expect.fail("expected CliError");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).exitCode).toBe(EXIT_VALIDATION);
    }
  });
});

describe("registerOperationsCommands", () => {
  it("passes the command object with global flags to operations get", async () => {
    runOperationsGetCommandMock.mockClear();
    const program = attachGlobalOptions(new Command());
    const resolveApi = vi.fn(async () => ({ api: {} as never, context: {} as never }));
    registerOperationsCommands(program, { globalFlags, resolveApi });

    await program.parseAsync([
      "node",
      "insecur",
      "--host",
      "https://insecur.test",
      "--org-id",
      "org_01TEST00000000000000000001",
      "--json",
      "--quiet",
      "operations",
      "get",
      "op_01TEST00000000000000000001",
    ]);

    expect(resolveApi).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "https://insecur.test",
        orgId: "org_01TEST00000000000000000001",
        json: true,
        quiet: true,
      }),
    );
    expect(runOperationsGetCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "https://insecur.test",
        orgId: "org_01TEST00000000000000000001",
        json: true,
        quiet: true,
      }),
      expect.anything(),
      expect.anything(),
      "op_01TEST00000000000000000001",
    );
  });

  it("passes the command object and timeout option to operations wait", async () => {
    runOperationsWaitCommandMock.mockClear();
    const program = attachGlobalOptions(new Command());
    registerOperationsCommands(program, {
      globalFlags,
      resolveApi: async () => ({ api: {} as never, context: {} as never }),
    });

    await program.parseAsync([
      "node",
      "insecur",
      "--host",
      "https://insecur.test",
      "--org-id",
      "org_01TEST00000000000000000001",
      "--json",
      "--quiet",
      "operations",
      "wait",
      "op_01TEST00000000000000000001",
      "--timeout",
      "30",
    ]);

    expect(runOperationsWaitCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "https://insecur.test",
        orgId: "org_01TEST00000000000000000001",
        json: true,
        quiet: true,
      }),
      expect.anything(),
      expect.anything(),
      { operationId: "op_01TEST00000000000000000001", timeoutSeconds: 30 },
    );
  });

  it("passes the command object with global flags to operations cancel", async () => {
    runOperationsCancelCommandMock.mockClear();
    const program = attachGlobalOptions(new Command());
    registerOperationsCommands(program, {
      globalFlags,
      resolveApi: async () => ({ api: {} as never, context: {} as never }),
    });

    await program.parseAsync([
      "node",
      "insecur",
      "--host",
      "https://insecur.test",
      "--org-id",
      "org_01TEST00000000000000000001",
      "--json",
      "--quiet",
      "operations",
      "cancel",
      "op_01TEST00000000000000000001",
    ]);

    expect(runOperationsCancelCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "https://insecur.test",
        orgId: "org_01TEST00000000000000000001",
        json: true,
        quiet: true,
      }),
      expect.anything(),
      expect.anything(),
      "op_01TEST00000000000000000001",
    );
  });
});
