#!/usr/bin/env node
import { organizationId } from "@insecur/domain";
import { queryFirstValueUsageEvidence } from "@insecur/audit";

function readRequiredEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function parseIsoDate(name, raw) {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${name} must be a valid ISO-8601 timestamp`);
  }
  return parsed;
}

async function main() {
  const orgRaw = readRequiredEnv("ORGANIZATION_ID");
  const startRaw = readRequiredEnv("WINDOW_START");
  const endRaw = readRequiredEnv("WINDOW_END");

  const evidence = await queryFirstValueUsageEvidence(organizationId.brand(orgRaw), {
    startInclusive: parseIsoDate("WINDOW_START", startRaw),
    endExclusive: parseIsoDate("WINDOW_END", endRaw),
  });

  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "query failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
