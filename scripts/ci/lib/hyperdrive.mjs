// Shared Cloudflare Hyperdrive helpers for the per-PR preview lifecycle.
// Name-matched lookup is the safety invariant: preview teardown must NEVER select a
// Hyperdrive by positional id (that can delete a shared/production config). Every
// destructive caller resolves the config by its exact `insecur-db-pr-N` name first.
import { spawn } from "node:child_process";

export const HYPERDRIVE_NAME_PREFIX = "insecur-db-";

const ID_PATTERN = /[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i;

/** Parse `wrangler hyperdrive list` output into { id, name } for our prefixed configs only. */
export function parseHyperdriveList(output) {
  const configs = [];
  for (const line of output.split(/\r?\n/)) {
    const id = line.match(ID_PATTERN)?.[0];
    if (!id || !line.includes(HYPERDRIVE_NAME_PREFIX)) {
      continue;
    }
    const name = line.match(new RegExp(`${HYPERDRIVE_NAME_PREFIX}[A-Za-z0-9/_-]+`))?.[0];
    if (name) {
      configs.push({ id, name });
    }
  }
  return configs;
}

/** Find a Hyperdrive config by exact name, or null. Never matches by position. */
export async function findHyperdriveByName(name) {
  const result = await run("pnpm", ["exec", "wrangler", "hyperdrive", "list"], {
    allowFailure: true,
  });
  if (result.code !== 0) {
    return null;
  }
  return parseHyperdriveList(result.stdout).find((config) => config.name === name) ?? null;
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      const result = { code: code ?? 1, stdout, stderr };
      if (result.code === 0 || options.allowFailure) {
        resolve(result);
      } else {
        reject(
          new Error(
            `${command} ${args.slice(0, 3).join(" ")} exited ${result.code}\n${stderr || stdout}`,
          ),
        );
      }
    });
  });
}

export function stringOption(argv, name) {
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}
