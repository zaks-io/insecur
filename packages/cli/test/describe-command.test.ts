import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/program.js";

describe("insecur describe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a machine-readable command contract without auth", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runCli(["node", "insecur", "describe", "run", "--json"]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(String(stdout.mock.calls[0]?.[0])) as {
      schemaVersion: string;
      data: {
        command: {
          path: string;
          arguments: { name: string }[];
          options: { long?: string }[];
          output: {
            schemaVersion: string;
            successStream: string;
            errorStream: string;
            childOutputStreamInJsonMode?: string;
          };
        };
      };
    };
    expect(parsed.schemaVersion).toBe("1");
    expect(parsed.data.command.path).toBe("insecur run");
    expect(parsed.data.command.arguments).toContainEqual(
      expect.objectContaining({ name: "profile" }),
    );
    expect(parsed.data.command.options).toContainEqual(
      expect.objectContaining({ long: "--variable-key" }),
    );
    expect(parsed.data.command.output).toEqual({
      schemaVersion: "1",
      successStream: "stdout",
      errorStream: "stderr",
      childOutputStreamInJsonMode: "stderr",
      watchOutputFormatInJsonMode: "jsonl",
    });
  });
});
