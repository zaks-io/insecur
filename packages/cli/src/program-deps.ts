import { Command, type Command as CommanderCommand } from "commander";
import { createHttpApiClientForHost } from "./api/http-client.js";
import { parseGlobalOptions } from "./cli-options.js";
import { loadAndResolveCliContext } from "./config/load-cli-context.js";
import type { GlobalCliFlags } from "./cli-options.js";

export function attachGlobalOptions(command: Command): Command {
  return command
    .option("--host <url>", "insecur API host")
    .option("--org-id <id>", "organization opaque id")
    .option("--project-id <id>", "project opaque id")
    .option("--env-id <id>", "environment opaque id")
    .option("--profile <slug>", "CLI profile slug")
    .option("--profile-id <id>", "CLI profile opaque id")
    .option("--config-dir <path>", "directory containing .insecur.json")
    .option("--agent <name>", "agent attribution tag (Tier 3)")
    .option("--json", "metadata-only JSON output")
    .option("--quiet", "suppress non-essential human output")
    .option("--verbose", "verbose logging");
}

export function globalFlags(command: CommanderCommand): GlobalCliFlags {
  return parseGlobalOptions(command.optsWithGlobals()).flags;
}

async function resolveApi(flags: GlobalCliFlags) {
  const context = await loadAndResolveCliContext(flags);
  return { api: createHttpApiClientForHost(context.scope.host), context };
}

export interface ProgramDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => ReturnType<typeof resolveApi>;
}

export function createProgramDeps(): ProgramDeps {
  return { globalFlags, resolveApi };
}
