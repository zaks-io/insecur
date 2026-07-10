import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentSetupCommand } from "../src/commands/agent-setup.js";

describe("insecur agent setup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("idempotently installs Codex instructions and a strict project hook", async () => {
    const projectDir = await mkdtemp(path.join(tmpdir(), "insecur-agent-setup-"));
    await writeFile(path.join(projectDir, "AGENTS.md"), "# Existing instructions\n", "utf8");
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const flags = {
      host: undefined,
      orgId: undefined,
      projectId: undefined,
      envId: undefined,
      profile: undefined,
      profileId: undefined,
      configDir: projectDir,
      agent: undefined,
      json: true,
      quiet: false,
      verbose: false,
      color: undefined,
      full: false,
    };

    await runAgentSetupCommand(flags, {
      harness: "codex",
      mode: "strict",
      dryRun: false,
      check: false,
    });
    await runAgentSetupCommand(flags, {
      harness: "codex",
      mode: "strict",
      dryRun: false,
      check: false,
    });

    const agents = await readFile(path.join(projectDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("# Existing instructions");
    expect(agents.match(/<!-- insecur:agents:start -->/g)).toHaveLength(1);
    expect(agents).toContain("insecur agent status --json");
    const hook = await readFile(
      path.join(projectDir, ".codex/hooks/insecur-scan-strict.sh"),
      "utf8",
    );
    expect(hook).toContain("insecur scan --strict --quiet");
    const config = JSON.parse(
      await readFile(path.join(projectDir, ".codex/hooks.json"), "utf8"),
    ) as { hooks: { PreToolUse: { hooks: { command: string }[] }[] } };
    expect(config.hooks.PreToolUse).toHaveLength(1);
    expect(config.hooks.PreToolUse[0]?.hooks[0]?.command).toContain("insecur-scan-strict.sh");

    await runAgentSetupCommand(flags, {
      harness: "codex",
      mode: "advisory",
      dryRun: false,
      check: false,
    });
    const switched = JSON.parse(
      await readFile(path.join(projectDir, ".codex/hooks.json"), "utf8"),
    ) as {
      hooks: {
        PreToolUse: { hooks: { command: string }[] }[];
        SessionStart: { hooks: { command: string }[] }[];
      };
    };
    expect(JSON.stringify(switched.hooks.PreToolUse)).not.toContain("insecur-scan-");
    expect(switched.hooks.SessionStart.at(-1)?.hooks[0]?.command).toContain(
      "insecur-scan-advisory.sh",
    );
    stdout.mockRestore();
  });
});
