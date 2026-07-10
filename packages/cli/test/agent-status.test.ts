import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/program.js";

describe("insecur agent status", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("orients an agent in Local Mode without opening the secret store", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = await runCli([
      "node",
      "insecur",
      "--host",
      "local",
      "--json",
      "agent",
      "status",
    ]);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(String(stdout.mock.calls[0]?.[0])) as {
      schemaVersion: string;
      data: {
        mode: string;
        session: { status: string };
        context: { host: string; configured: boolean };
        capabilities: { available: string[] };
        missingPrerequisites: string[];
      };
      next: { argv?: string[] }[];
    };
    expect(parsed.schemaVersion).toBe("1");
    expect(parsed.data).toMatchObject({
      mode: "local",
      session: { status: "not_required" },
      context: { host: "local", configured: false },
      missingPrerequisites: ["project_config"],
    });
    expect(parsed.data.capabilities.available).toContain("run:variable-key");
    expect(parsed.next[0]?.argv).toEqual(["insecur", "init", "--host", "local", "--json"]);
  });
});
