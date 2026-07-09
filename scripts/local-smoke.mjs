#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export function parseArgs(argv) {
  const options = {
    withDocker: false,
  };

  for (const arg of argv) {
    switch (arg) {
      case "--":
        break;
      case "--with-docker":
        options.withDocker = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function localSmokeCommands(options) {
  const commands = [];

  if (options.withDocker) {
    commands.push(["pnpm", ["dev:db:reset"]]);
  } else {
    commands.push(["pnpm", ["dev:db:reset-service"]]);
  }

  commands.push(["node", ["scripts/ci/postgres-integration-tests.mjs"]]);
  return commands;
}

export function runLocalSmoke(options, runner = runCommand) {
  for (const [command, args] of localSmokeCommands(options)) {
    runner(command, args);
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.withDocker) {
      console.log("Running local smoke with Docker Compose Postgres reset.");
    } else {
      console.log(
        "Resetting configured Postgres, then running local smoke. Use --with-docker to reset Docker Compose Postgres first.",
      );
    }
    runLocalSmoke(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function printHelp() {
  console.log(`Usage: pnpm smoke:local [-- --with-docker]

Runs the DB-backed local smoke gate. Without --with-docker, the configured
Postgres service is reset and migrated first:
  pnpm test:rls
  pnpm test:e2e
  pnpm --filter @insecur/cli test:integration
  pnpm test:canary

Options:
  --with-docker  Reset and migrate Docker Compose Postgres before smoke tests
`);
}
