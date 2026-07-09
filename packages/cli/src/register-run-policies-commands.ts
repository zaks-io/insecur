import type { Command, Command as CommanderCommand } from "commander";
import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { runRunPoliciesCreateCommand } from "./commands/run-policies-create.js";
import { runRunPoliciesDisableCommand } from "./commands/run-policies-disable.js";
import { runRunPoliciesShowCommand } from "./commands/run-policies-show.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { CliError } from "./output/cli-error.js";

interface RunPoliciesDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
    api: Parameters<typeof runRunPoliciesCreateCommand>[1];
    context: Parameters<typeof runRunPoliciesCreateCommand>[2];
  }>;
}

export function registerRunPoliciesCommands(program: Command, deps: RunPoliciesDeps): void {
  const runPolicies = program
    .command("run-policies")
    .description("Manage Runtime Injection Policies (metadata only)");

  registerRunPoliciesCreateCommand(runPolicies, deps);
  registerRunPoliciesShowCommand(runPolicies, deps);
  registerRunPoliciesDisableCommand(runPolicies, deps);
}

function registerRunPoliciesCreateCommand(runPolicies: Command, deps: RunPoliciesDeps): void {
  runPolicies
    .command("create")
    .description("Create an immutable Runtime Injection Policy Version and set the active pointer")
    .requiredOption("--policy-id <id>", "client-minted runtime policy opaque id")
    .option("--env-id <id>", "target environment opaque id")
    .option("--display-name-stdin", "read the Display Name from stdin")
    .requiredOption("--command <cmd>", "approved command shape")
    .option("--command-fingerprint <hash>", "command fingerprint (sha256:...)")
    .requiredOption("--secret-ids <ids>", "comma-separated exact secret opaque ids")
    .option("--operation-id <id>", "resume after High-Assurance Challenge clearance")
    .action(async function runPoliciesCreateAction(this: CommanderCommand) {
      const flags = deps.globalFlags(this);
      const options = this.opts<{
        policyId: string;
        envId?: string;
        displayNameStdin?: boolean;
        command: string;
        commandFingerprint?: string;
        secretIds: string;
        operationId?: string;
      }>();
      const envId = resolveRunPolicyEnvironmentId(options, flags);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runRunPoliciesCreateCommand(flags, api, context, {
        policyId: options.policyId,
        envId,
        displayNameStdin: options.displayNameStdin === true,
        command: options.command,
        commandFingerprint: options.commandFingerprint,
        secretIds: options.secretIds,
        operationId: options.operationId,
      });
    });
}

function registerRunPoliciesShowCommand(runPolicies: Command, deps: RunPoliciesDeps): void {
  runPolicies
    .command("show")
    .description("Show runtime injection policy metadata")
    .argument("<policy-id>", "runtime policy opaque id")
    .action(async function runPoliciesShowAction(this: CommanderCommand, policyId: string) {
      const flags = deps.globalFlags(this);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runRunPoliciesShowCommand(flags, api, context, policyId);
    });
}

function registerRunPoliciesDisableCommand(runPolicies: Command, deps: RunPoliciesDeps): void {
  runPolicies
    .command("disable")
    .description("Disable a runtime injection policy with audit")
    .argument("<policy-id>", "runtime policy opaque id")
    .option("--env-id <id>", "environment opaque id")
    .requiredOption("--comment <text>", "audit comment")
    .option("--operation-id <id>", "resume after High-Assurance Challenge clearance")
    .action(async function runPoliciesDisableAction(this: CommanderCommand, policyId: string) {
      const flags = deps.globalFlags(this);
      const options = this.opts<{
        envId?: string;
        comment: string;
        operationId?: string;
      }>();
      const envId = resolveRunPolicyEnvironmentId(options, flags);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runRunPoliciesDisableCommand(flags, api, context, {
        policyId,
        envId,
        comment: options.comment,
        operationId: options.operationId,
      });
    });
}

function resolveRunPolicyEnvironmentId(
  options: { readonly envId?: string },
  flags: GlobalCliFlags,
): string {
  if (options.envId !== undefined) {
    return options.envId;
  }
  if (flags.envId !== undefined) {
    return flags.envId;
  }
  throw new CliError({
    code: VALIDATION_ERROR_CODES.invalidCommandInput,
    message: "--env-id or a configured environment scope is required.",
    retryable: false,
  });
}
