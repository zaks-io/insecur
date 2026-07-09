import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { attachGlobalOptions, globalFlags } from "../src/program-deps.js";
import { registerAuditCommands } from "../src/audit-commands.js";

const runAuditVerifyCommandMock = vi.hoisted(() => vi.fn(async () => 0));

vi.mock("../src/commands/audit-verify.js", () => ({
  runAuditVerifyCommand: runAuditVerifyCommandMock,
}));

describe("registerAuditVerifyCommand", () => {
  it("reads globals and verify options from the commander action context", async () => {
    runAuditVerifyCommandMock.mockClear();
    process.exitCode = undefined;

    const program = attachGlobalOptions(new Command());
    registerAuditCommands(program, {
      globalFlags,
      resolveApi: async () => ({ api: {} as never, context: {} as never }),
    });

    await program.parseAsync([
      "node",
      "insecur",
      "--host",
      "https://insecur.test",
      "--org-id",
      "org_00000000000000000000000001",
      "--json",
      "--quiet",
      "audit",
      "verify",
      "/tmp/audit-export.jsonl",
      "--manifest",
      "/tmp/audit-export.manifest.json",
      "--published-signing-keys",
      "https://insecur.test/.well-known/insecur/audit-export-signing-keys.json",
    ]);

    expect(runAuditVerifyCommandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "https://insecur.test",
        json: true,
        orgId: "org_00000000000000000000000001",
        quiet: true,
      }),
      "/tmp/audit-export.jsonl",
      {
        manifestPath: "/tmp/audit-export.manifest.json",
        publishedSigningKeysPath:
          "https://insecur.test/.well-known/insecur/audit-export-signing-keys.json",
      },
    );
    expect(process.exitCode).toBe(0);
  });
});
