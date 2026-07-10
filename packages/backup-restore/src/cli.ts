#!/usr/bin/env node
import { resolve } from "node:path";

import { runBackupFixtureSelfTest } from "./run-local-drill.js";
import { verifyBackupRestoreEvidence } from "./verify-evidence.js";

function evidenceDirFromArgv(argv: string[]): string {
  const flagIndex = argv.indexOf("--evidence-dir");
  const value = flagIndex === -1 ? undefined : argv[flagIndex + 1];
  return value ? resolve(value) : resolve(process.cwd(), "evidence");
}

async function runFixtureSelfTest(argv: string[]): Promise<void> {
  const evidenceDir = evidenceDirFromArgv(argv);
  const result = await runBackupFixtureSelfTest({ evidenceDir });

  const summary = {
    ok: result.evidence.status === "passed",
    fixture_only: true,
    launch_grade_evidence: false,
    canary_verified: result.evidence.canary_verified,
    encryption_verified: result.evidence.encryption_verified,
    artifact_ref: result.evidence.artifact_ref,
    evidence_dir: evidenceDir,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

function runVerify(argv: string[]): void {
  const evidenceDir = evidenceDirFromArgv(argv);
  const result = verifyBackupRestoreEvidence({ evidenceDir });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "fixture-self-test") {
    await runFixtureSelfTest(rest);
    return;
  }
  if (command === "verify-evidence") {
    runVerify(rest);
    return;
  }

  throw new Error(
    "usage: backup-restore <fixture-self-test|verify-evidence> [--evidence-dir path]",
  );
}

try {
  await main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
