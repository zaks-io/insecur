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
    .option("--color", "force colored human output")
    .option("--no-color", "disable colored human output")
    .option("--full", "show full opaque ids in tables instead of truncating")
    .option(
      "--no-crash-reports",
      "disable default-on sanitized CLI crash reporting for this command",
    );
}

export function globalFlags(command: CommanderCommand): GlobalCliFlags {
  return parseGlobalOptions(command.optsWithGlobals()).flags;
}

/**
 * The output-shaping flags (`--json`/`--quiet`/`--verbose`/`--color`) read
 * directly, skipping the resource-id parses that can throw. The failure renderer
 * must select its output mode even when the very flag that failed parsing (a
 * malformed `--env-id`, say) is what raised the error — otherwise the renderer
 * would throw again inside the catch and the CliError would escape unrendered.
 */
export function renderFlags(command: CommanderCommand): RenderFlags {
  const options = command.optsWithGlobals<{
    json?: boolean;
    quiet?: boolean;
    verbose?: boolean;
    color?: boolean;
  }>();
  return {
    json: options.json === true,
    quiet: options.quiet === true,
    verbose: options.verbose === true,
    color: options.color === undefined ? undefined : options.color ? "always" : "never",
  };
}

export interface RenderFlags {
  readonly json: boolean;
  readonly quiet: boolean;
  readonly verbose: boolean;
  readonly color: "always" | "never" | undefined;
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
  /**
   * HTTP client for an explicit Hosted Instance, regardless of the resolved project host.
   * `projects migrate` needs this: its project config says `"local"` while its target is a
   * cloud host, so the host-driven `resolveApi` seam cannot serve it.
   */
  readonly createHostedApi: (host: string) => ApiClient;
}

export function createProgramDeps(options: ProgramDepsOptions = {}): ProgramDeps {
  const httpOptions =
    options.traceHeaders === undefined ? {} : { traceHeaders: options.traceHeaders };
  return {
    globalFlags,
    resolveApi: buildResolveApi(options),
    createHostedApi: (host) => createHttpApiClientForHost(host, httpOptions),
  };
}
