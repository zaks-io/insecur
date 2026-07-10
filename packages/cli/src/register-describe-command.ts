import { successEnvelope } from "@insecur/domain";
import type { Argument, Command, Option } from "commander";
import { CLI_ENVELOPE_SCHEMA_VERSION, renderSuccess } from "./output/render.js";
import type { ProgramDeps } from "./program-deps.js";

function findCommand(root: Command, path: readonly string[]): Command | undefined {
  let current = root;
  for (const segment of path) {
    const next = current.commands.find((candidate) => candidate.name() === segment);
    if (next === undefined) {
      return undefined;
    }
    current = next;
  }
  return current;
}

function serializeArgument(argument: Argument) {
  const defaultValue = argument.defaultValue as unknown;
  return {
    name: argument.name(),
    description: argument.description,
    required: argument.required,
    variadic: argument.variadic,
    ...(defaultValue === undefined ? {} : { defaultValue }),
  };
}

function serializeOption(option: Option) {
  const defaultValue = option.defaultValue as unknown;
  return {
    flags: option.flags,
    ...(option.short === undefined ? {} : { short: option.short }),
    ...(option.long === undefined ? {} : { long: option.long }),
    description: option.description,
    required: option.required,
    optional: option.optional,
    variadic: option.variadic,
    ...(defaultValue === undefined ? {} : { defaultValue }),
  };
}

function uniqueOptions(options: readonly Option[]): readonly Option[] {
  const byFlags = new Map<string, Option>();
  for (const option of options) {
    byFlags.set(option.flags, option);
  }
  return [...byFlags.values()];
}

export function registerDescribeCommand(program: Command, deps: ProgramDeps): void {
  program
    .command("describe")
    .description("Describe the CLI command contract as metadata")
    .argument("[command-path...]", "space-separated command path")
    .action(function describeAction(commandPath: string[], _options, command: Command) {
      const flags = deps.globalFlags(command);
      const target = findCommand(program, commandPath);
      if (target === undefined) {
        command.error(`Unknown command path: ${commandPath.join(" ")}`);
        return;
      }
      const path = [program.name(), ...commandPath].join(" ");
      const data = {
        command: {
          path,
          description: target.description(),
          arguments: target.registeredArguments.map(serializeArgument),
          options: uniqueOptions([...program.options, ...target.options]).map(serializeOption),
          subcommands: target.commands.map((child) => ({
            name: child.name(),
            description: child.description(),
          })),
          output: {
            schemaVersion: CLI_ENVELOPE_SCHEMA_VERSION,
            successStream: "stdout",
            errorStream: "stderr",
            ...(commandPath[0] === "run"
              ? {
                  childOutputStreamInJsonMode: "stderr",
                  watchOutputFormatInJsonMode: "jsonl",
                }
              : {}),
          },
        },
      };
      renderSuccess(successEnvelope(data), flags, () => `${path}: ${target.description()}`);
      process.exitCode = 0;
    });
}
