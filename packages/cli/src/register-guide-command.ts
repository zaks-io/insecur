import type { Command } from "commander";
import { runGuideCommand } from "./commands/guide.js";

export function registerGuideCommand(program: Command): void {
  program
    .command("guide")
    .description("Offline CLI guides (markdown playbooks, no auth required)")
    .argument("[topic]", "guide topic id (omit to list topics)")
    .action(function guideAction(topic: string | undefined) {
      process.exitCode = runGuideCommand(topic);
    });
}
