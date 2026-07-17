#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const TARGETS = [
  ["insecur-api", "https://api.insecur.cloud/healthz"],
  ["insecur-web", "https://app.insecur.cloud/healthz"],
  ["insecur-site", "https://insecur.cloud/healthz"],
];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const expectedSha = process.argv[2];
  verifyProductionHealth(expectedSha).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${message}`);
    process.exit(1);
  });
}

export async function verifyProductionHealth(
  expectedSha,
  { attempts = 12, fetcher = fetch, retryDelayMs = 5_000 } = {},
) {
  if (!/^[0-9a-f]{40}$/u.test(expectedSha ?? "")) {
    throw new Error("Expected production deploy SHA must be a full Git commit SHA.");
  }
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const identities = await Promise.all(
        TARGETS.map(([service, url]) => readHealth(fetcher, service, url, expectedSha)),
      );
      const runIds = new Set(identities.map(({ runId }) => runId));
      if (runIds.size !== 1)
        throw new Error("Production services report different deploy run IDs.");
      console.log(`Production health verified for ${expectedSha} (run ${identities[0].runId}).`);
      return identities;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(retryDelayMs);
    }
  }
  throw lastError;
}

export function validateHealthBody(body, expectedService, expectedSha) {
  if (body?.ok !== true) throw new Error(`${expectedService} health did not report ok=true.`);
  if (body?.service !== expectedService) {
    throw new Error(`${expectedService} health reported service ${String(body?.service)}.`);
  }
  if (body?.deploySha !== expectedSha) {
    throw new Error(
      `${expectedService} health reported deploy SHA ${String(body?.deploySha)}, expected ${expectedSha}.`,
    );
  }
  if (!/^\d+$/u.test(String(body?.runId ?? ""))) {
    throw new Error(`${expectedService} health did not report a valid deploy run ID.`);
  }
  return { deploySha: body.deploySha, runId: String(body.runId), service: body.service };
}

async function readHealth(fetcher, service, url, expectedSha) {
  const response = await fetcher(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`${service} health returned ${response.status}.`);
  return validateHealthBody(await response.json(), service, expectedSha);
}
