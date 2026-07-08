import type { Command as CommanderCommand } from "commander";

export function commanderRawArgv(command: CommanderCommand | null | undefined): readonly string[] {
  if (command === null || command === undefined) {
    return process.argv;
  }

  const readRawArgs = (target: CommanderCommand | null | undefined): readonly string[] => {
    if (target === null || target === undefined) {
      return [];
    }
    const raw = (target as unknown as { rawArgs?: unknown }).rawArgs;
    return Array.isArray(raw) && raw.every((token) => typeof token === "string") ? raw : [];
  };

  for (const candidate of [command, command.parent, command.parent?.parent]) {
    const rawArgs = readRawArgs(candidate);
    if (rawArgs.length > 0) {
      return rawArgs;
    }
  }

  return process.argv;
}

export function childCommandAfterSeparator(command: CommanderCommand): readonly string[] {
  const rawArgs = commanderRawArgv(command);
  const separatorIndex = rawArgs.indexOf("--");
  if (separatorIndex >= 0) {
    return rawArgs.slice(separatorIndex + 1);
  }
  return command.args.filter((token): token is string => typeof token === "string");
}
