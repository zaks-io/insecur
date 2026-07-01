// Shared helpers for the deploy scripts (deploy-preview.mjs, deploy-site.mjs).
import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run a command to completion, inheriting stdio (or piping stdin when `input` is given). Throws on nonzero exit. */
export function run(command, args, { cwd, env = process.env, input } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    input,
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status ?? 1}`);
  }
}

/** Append a `name=value` line to $GITHUB_OUTPUT when running under GitHub Actions. */
export function emitOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

async function fetchStatus(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.status;
  } catch {
    return 0;
  }
}

/**
 * Poll `${baseUrl}/healthz` until it returns 200 three times in a row, or throw after `attempts`
 * tries (2s apart).
 */
export async function waitForHealthz(baseUrl, attempts = 45) {
  let consecutive = 0;
  for (let i = 1; i <= attempts; i += 1) {
    const status = await fetchStatus(`${baseUrl}/healthz`);
    if (status === 200) {
      consecutive += 1;
      process.stdout.write(`${baseUrl}/healthz healthy (${consecutive}/3) on attempt ${i}\n`);
      if (consecutive >= 3) {
        return;
      }
    } else {
      consecutive = 0;
      process.stdout.write(`not ready (status=${status}) on attempt ${i}, retrying...\n`);
    }
    await sleep(2000);
  }
  throw new Error(`${baseUrl}/healthz never got 3 consecutive healthy responses`);
}
