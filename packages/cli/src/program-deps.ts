import { Command, type Command as CommanderCommand } from "commander";
import { createHttpApiClientForHost } from "./api/http-client.js";
import { createLocalApiClient } from "./api/local-client.js";
import { parseGlobalOptions } from "./cli-options.js";
import { loadAndResolveCliContext } from "./config/load-cli-context.js";
import { isLocalModeHost } from "./config/local-mode.js";
import { openLocalStore } from "./local/open-local-store.js";
import type { GlobalCliFlags } from "./cli-options.js";
import type { ApiClient } from "./api/types.js";
import type { ResolvedCliContext } from "./config/load-cli-context.js";

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
    .option("--verbose", "verbose logging")
    .option(
      "--no-crash-reports",
      "disable default-on sanitized CLI crash reporting for this command",
    );
}

export function globalFlags(command: CommanderCommand): GlobalCliFlags {
  return parseGlobalOptions(command.optsWithGlobals()).flags;
}

interface ResolvedApi {
  readonly api: ApiClient;
  readonly context: ResolvedCliContext;
  readonly dispose?: () => void;
}

interface ProgramDepsOptions {
  readonly traceHeaders?: () => Record<string, string>;
}

function buildResolveApi(options: ProgramDepsOptions): ProgramDeps["resolveApi"] {
  return async function resolveApi(flags: GlobalCliFlags): Promise<ResolvedApi> {
    const context = await loadAndResolveCliContext(flags);
    if (isLocalModeHost(context.scope.host)) {
      const localStore = openLocalStore();
      return {
        api: createLocalApiClient({ store: localStore, context, flags }),
        context,
        dispose: () => {
          localStore.close();
        },
      };
    }
    const httpOptions =
      options.traceHeaders === undefined ? {} : { traceHeaders: options.traceHeaders };
    return { api: createHttpApiClientForHost(context.scope.host, httpOptions), context };
  };
}

export interface ProgramDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<ResolvedApi>;
}

export function createProgramDeps(options: ProgramDepsOptions = {}): ProgramDeps {
  return { globalFlags, resolveApi: buildResolveApi(options) };
}
