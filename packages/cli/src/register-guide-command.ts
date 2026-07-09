import type { Command } from "commander";

export function registerGuideCommand(program: Command): void {
  program
    .command("guide")
    .description("Offline CLI guides (markdown playbooks, no auth required)")
    .argument("[topic]", "guide topic id (omit to list topics)")
    .action(async function guideAction(topic: string | undefined) {
      const { runGuideCommand } = await import("./commands/guide.js");
      process.exitCode = runGuideCommand(topic);
    });
}
