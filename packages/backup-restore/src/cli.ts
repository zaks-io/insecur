#!/usr/bin/env node
import { resolve } from "node:path";

import { runLocalRestoreDrill } from "./run-local-drill.js";
import { verifyBackupRestoreEvidence } from "./verify-evidence.js";

function evidenceDirFromArgv(argv: string[]): string {
  const flagIndex = argv.indexOf("--evidence-dir");
  const value = flagIndex === -1 ? undefined : argv[flagIndex + 1];
  return value ? resolve(value) : resolve(process.cwd(), "evidence");
}

function restoreTargetRefFromArgv(argv: string[]): string | undefined {
  const flagIndex = argv.indexOf("--restore-target-ref");
  if (flagIndex === -1) {
    return undefined;
  }
  return argv[flagIndex + 1];
}

async function runDrill(argv: string[]): Promise<void> {
  const evidenceDir = evidenceDirFromArgv(argv);
  const restoreTargetRef = restoreTargetRefFromArgv(argv);
  const result = await runLocalRestoreDrill({
    evidenceDir,
    ...(restoreTargetRef ? { restoreTargetRef } : {}),
  });

  const summary = {
    ok: result.drillEvidence.status === "passed" && result.exportEvidence.status === "passed",
    export_status: result.exportEvidence.status,
    drill_status: result.drillEvidence.status,
    canary_status: result.drillEvidence.canary_verification.status,
    encryption_verified: result.drillEvidence.encryption_verified,
    rto_seconds: result.drillEvidence.rto.duration_seconds,
    artifact_ref: result.drillEvidence.artifact_ref,
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
  if (command === "drill") {
    await runDrill(rest);
    return;
  }
  if (command === "verify-evidence") {
    runVerify(rest);
    return;
  }

  throw new Error("usage: backup-restore <drill|verify-evidence> [--evidence-dir path]");
}

try {
  await main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
