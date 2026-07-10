import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { assertPreviewSmokeDeployIdentityEvidence } from "./preview-smoke-deploy-identity-evidence.js";

interface ParsedArgs {
  evidencePath: string;
  expectedSha: string;
}

const REQUIRED_OPTIONS = ["--evidence", "--expected-sha"] as const;

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const evidence = JSON.parse(readFileSync(args.evidencePath, "utf8")) as unknown;
  assertPreviewSmokeDeployIdentityEvidence(evidence, args.expectedSha);
  console.log(`Preview smoke deploy identity evidence verified for ${args.expectedSha}`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const options = parseOptions(argv);
  return {
    evidencePath: resolve(requiredOption(options, "--evidence")),
    expectedSha: requiredOption(options, "--expected-sha"),
  };
}

function parseOptions(argv: string[]): Map<string, string> {
  if (argv.length !== REQUIRED_OPTIONS.length * 2) {
    throw new Error("Usage: --evidence <path> --expected-sha <sha>");
  }

  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag || !value || !REQUIRED_OPTIONS.includes(flag as (typeof REQUIRED_OPTIONS)[number])) {
      throw new Error("Usage: --evidence <path> --expected-sha <sha>");
    }
    options.set(flag, value);
  }
  if (options.size !== REQUIRED_OPTIONS.length) {
    throw new Error("Usage: --evidence <path> --expected-sha <sha>");
  }
  return options;
}

function requiredOption(options: Map<string, string>, name: string): string {
  const value = options.get(name);
  if (!value) {
    throw new Error("Usage: --evidence <path> --expected-sha <sha>");
  }
  return value;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
