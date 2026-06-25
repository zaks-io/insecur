#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { assembleSecurityEvidenceBundle } from "./assemble-bundle.js";
import { assertBundleIsMetadataSafe } from "./assert-metadata-safe.js";
import type { ReleaseGateProfile } from "./types.js";

interface ParsedArgs {
  evidenceDir: string;
  outputPath?: string;
  profile?: ReleaseGateProfile;
}

function readFlagValue(argv: string[], index: number, flag: string): [string, number] {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }

  return [value, index + 1];
}

function applyArg(arg: string, argv: string[], index: number, parsed: ParsedArgs): number {
  if (arg === "--evidence-dir") {
    const [value, nextIndex] = readFlagValue(argv, index, arg);
    parsed.evidenceDir = resolve(value);
    return nextIndex;
  }

  if (arg === "--output") {
    const [value, nextIndex] = readFlagValue(argv, index, arg);
    parsed.outputPath = resolve(value);
    return nextIndex;
  }

  if (arg === "--profile") {
    const [value, nextIndex] = readFlagValue(argv, index, arg);
    if (value !== "production_deploy" && value !== "small_group_production") {
      throw new Error("--profile must be production_deploy or small_group_production");
    }
    parsed.profile = value;
    return nextIndex;
  }

  return index;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    evidenceDir: resolve(process.cwd(), "evidence"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }

    index = applyArg(arg, argv, index, parsed);
  }

  return parsed;
}

function main(): void {
  const { evidenceDir, outputPath, profile } = parseArgs(process.argv.slice(2));
  const bundle = assembleSecurityEvidenceBundle({
    evidenceDir,
    ...(profile ? { profile } : {}),
  });

  assertBundleIsMetadataSafe(bundle);

  const serialized = `${JSON.stringify(bundle, null, 2)}\n`;

  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized, "utf8");
  } else {
    process.stdout.write(serialized);
  }

  if (!bundle.ok) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
