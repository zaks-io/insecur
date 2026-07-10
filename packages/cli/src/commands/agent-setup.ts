import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { successEnvelope, type NextAction } from "@insecur/domain";
import type { GlobalCliFlags } from "../cli-options.js";
import { resolveProjectRoot } from "../config/paths.js";
import { CliError } from "../output/cli-error.js";
import { EXIT_ACTION_REQUIRED } from "../output/exit-codes.js";
import { renderSuccess } from "../output/render.js";

const START = "<!-- insecur:agents:start -->";
const END = "<!-- insecur:agents:end -->";

const AGENT_INSTRUCTIONS = `${START}
## Secrets with insecur

- Start with \`insecur agent status --json\` and follow the ordered \`next\` actions.
- Use \`insecur describe <command> --json\` instead of parsing help text.
- Never read, echo, request, or place a plaintext secret in arguments or agent context.
- Plan with \`insecur run --plan ...\` and use secrets only through \`insecur run\`.
- Create generated values with \`insecur secrets set <KEY> --generate random --json\`.
- For human-provided values, ask the human to use \`--value-stdin\`; do not receive the value.
- Treat exit 10 as a human handoff and execute the envelope's ordered \`next\` actions.
${END}`;

const STRICT_HOOK = `#!/usr/bin/env bash
set -euo pipefail
stderr_file="$(mktemp)"
trap 'rm -f "$stderr_file"' EXIT
if insecur scan --strict --quiet 2>"$stderr_file"; then
  exit 0
fi
summary="$(tr -d '\\n' <"$stderr_file")"
printf 'Blocked by insecur: %s. Run insecur guide migrate-env.\\n' "$summary" >&2
exit 2
`;

const ADVISORY_HOOK = `#!/usr/bin/env bash
set -euo pipefail
stderr_file="$(mktemp)"
trap 'rm -f "$stderr_file"' EXIT
if insecur scan --strict --quiet 2>"$stderr_file"; then
  exit 0
fi
summary="$(tr -d '\\n' <"$stderr_file")"
printf 'insecur scan: %s. Run insecur guide migrate-env.\\n' "$summary"
`;

export interface AgentSetupCommandOptions {
  readonly harness: string;
  readonly mode: string;
  readonly dryRun: boolean;
  readonly check: boolean;
}

function replaceManagedBlock(existing: string): string {
  const start = existing.indexOf(START);
  const end = existing.indexOf(END);
  if (start >= 0 && end >= start) {
    return `${existing.slice(0, start)}${AGENT_INSTRUCTIONS}${existing.slice(end + END.length)}`;
  }
  return `${existing.trimEnd()}${existing.trim() === "" ? "" : "\n\n"}${AGENT_INSTRUCTIONS}\n`;
}

async function readText(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

function harnessPaths(root: string, harness: "codex" | "claude", mode: "advisory" | "strict") {
  const base = harness === "codex" ? ".codex" : ".claude";
  return {
    hookPath: path.join(root, base, "hooks", `insecur-scan-${mode}.sh`),
    configPath: path.join(root, base, harness === "codex" ? "hooks.json" : "settings.json"),
    relativeHookPath: `${base}/hooks/insecur-scan-${mode}.sh`,
  };
}

function hookGroup(harness: "codex" | "claude", mode: "advisory" | "strict", command: string) {
  return {
    matcher:
      mode === "advisory"
        ? "startup|resume"
        : harness === "codex"
          ? "Bash|apply_patch|Edit|Write"
          : "Read|Grep|Glob|Bash|Edit|Write",
    hooks: [{ type: "command", command, timeout: 120 }],
  };
}

function removeInsecurHookEntries(hooks: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(hooks).map(([event, entries]) => [
      event,
      Array.isArray(entries)
        ? entries.filter((entry) => !JSON.stringify(entry).includes("insecur-scan-"))
        : entries,
    ]),
  );
}

function mergeHookConfig(
  raw: string,
  harness: "codex" | "claude",
  mode: "advisory" | "strict",
  command: string,
): Record<string, unknown> {
  const config = raw.trim() === "" ? {} : (JSON.parse(raw) as Record<string, unknown>);
  const hooks =
    config.hooks !== null && typeof config.hooks === "object" && !Array.isArray(config.hooks)
      ? (config.hooks as Record<string, unknown>)
      : {};
  const preservedHooks = removeInsecurHookEntries(hooks);
  const event = mode === "advisory" ? "SessionStart" : "PreToolUse";
  const existing = Array.isArray(preservedHooks[event]) ? (preservedHooks[event] as unknown[]) : [];
  return {
    ...config,
    hooks: { ...preservedHooks, [event]: [...existing, hookGroup(harness, mode, command)] },
  };
}

function parseSetupOptions(options: AgentSetupCommandOptions): {
  harness: "codex" | "claude";
  mode: "advisory" | "strict";
} {
  if (options.harness !== "codex" && options.harness !== "claude") {
    throw new CliError({
      code: "validation.invalid_command_input",
      message: "--harness must be codex or claude.",
      retryable: false,
    });
  }
  if (options.mode !== "advisory" && options.mode !== "strict") {
    throw new CliError({
      code: "validation.invalid_command_input",
      message: "--mode must be advisory or strict.",
      retryable: false,
    });
  }
  return { harness: options.harness, mode: options.mode };
}

async function prepareAgentSetup(
  root: string,
  harness: "codex" | "claude",
  mode: "advisory" | "strict",
) {
  const agentsPath = path.join(root, "AGENTS.md");
  const paths = harnessPaths(root, harness, mode);
  const command = `/usr/bin/env bash "$(git rev-parse --show-toplevel)/${paths.relativeHookPath}"`;
  const agentsContent = replaceManagedBlock(await readText(agentsPath));
  const hookContent = mode === "strict" ? STRICT_HOOK : ADVISORY_HOOK;
  const configContent = `${JSON.stringify(
    mergeHookConfig(await readText(paths.configPath), harness, mode, command),
    null,
    2,
  )}\n`;
  const files = [agentsPath, paths.hookPath, paths.configPath];
  const desired = [agentsContent, hookContent, configContent];
  const current = await Promise.all(files.map(readText));
  const changed = files.filter((_file, index) => current[index] !== desired[index]);
  return { paths, agentsPath, agentsContent, hookContent, configContent, changed };
}

async function writeAgentSetup(plan: Awaited<ReturnType<typeof prepareAgentSetup>>): Promise<void> {
  await mkdir(path.dirname(plan.paths.hookPath), { recursive: true });
  await writeFile(plan.agentsPath, plan.agentsContent, "utf8");
  await writeFile(plan.paths.hookPath, plan.hookContent, { encoding: "utf8", mode: 0o755 });
  await chmod(plan.paths.hookPath, 0o755);
  await writeFile(plan.paths.configPath, plan.configContent, "utf8");
}

function setupStatus(options: AgentSetupCommandOptions, changed: readonly string[]): string {
  if (options.check) {
    return changed.length === 0 ? "current" : "drifted";
  }
  return options.dryRun ? "planned" : "configured";
}

export async function runAgentSetupCommand(
  flags: GlobalCliFlags,
  options: AgentSetupCommandOptions,
): Promise<number> {
  const { harness, mode } = parseSetupOptions(options);
  const root = resolveProjectRoot(flags.configDir);
  const plan = await prepareAgentSetup(root, harness, mode);
  if (!options.dryRun && !options.check) {
    await writeAgentSetup(plan);
  }
  const next: readonly NextAction[] = [
    {
      id: "verify-agent-status",
      actor: "agent",
      kind: "execute",
      argv: ["insecur", "agent", "status", "--json"],
    },
  ];
  renderSuccess(
    successEnvelope(
      {
        harness,
        mode,
        status: setupStatus(options, plan.changed),
        dryRun: options.dryRun,
        changedFiles: plan.changed,
      },
      undefined,
      next,
    ),
    flags,
    () => `${options.dryRun ? "Would configure" : "Configured"} ${harness} ${mode} agent setup.`,
  );
  return options.check && plan.changed.length > 0 ? EXIT_ACTION_REQUIRED : 0;
}
