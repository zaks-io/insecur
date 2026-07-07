import { readFile, stat } from "node:fs/promises";
import { classifyDotenvKeyName } from "./classifiers.js";
import type { MachineScanTarget } from "./machine-locations.js";
import {
  awsCredentialsFinding,
  scanFileAtPath,
  shellRcFinding,
  toWholeFileFinding,
} from "./scan-file.js";
import { parseShellRcExportKeys } from "./shell-rc-parser.js";
import type { ScanFinding } from "./types.js";

interface TargetScanOutcome {
  readonly findings: readonly ScanFinding[];
  readonly entryCount: number;
  readonly unreadable: boolean;
}

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function isAwsCredentialsPath(displayPath: string): boolean {
  return displayPath === "~/.aws/credentials" || displayPath.endsWith("/.aws/credentials");
}

function isDockerConfigPath(displayPath: string): boolean {
  return displayPath === "~/.docker/config.json" || displayPath.endsWith("/.docker/config.json");
}

async function scanAwsCredentials(
  displayPath: string,
  absolutePath: string,
): Promise<TargetScanOutcome> {
  if (!(await pathExists(absolutePath))) {
    return { findings: [], entryCount: 0, unreadable: false };
  }
  return {
    findings: [awsCredentialsFinding(displayPath)],
    entryCount: 1,
    unreadable: false,
  };
}

async function scanDockerConfig(
  displayPath: string,
  absolutePath: string,
): Promise<TargetScanOutcome> {
  if (!(await pathExists(absolutePath))) {
    return { findings: [], entryCount: 0, unreadable: false };
  }
  return {
    findings: [
      toWholeFileFinding(displayPath, "machine", "credential-json", { key: "config.json" }),
    ],
    entryCount: 1,
    unreadable: false,
  };
}

async function scanKnownFixedFile(target: MachineScanTarget): Promise<TargetScanOutcome> {
  if (isAwsCredentialsPath(target.displayPath)) {
    return scanAwsCredentials(target.displayPath, target.absolutePath);
  }
  if (isDockerConfigPath(target.displayPath)) {
    return scanDockerConfig(target.displayPath, target.absolutePath);
  }

  const result = await scanFileAtPath({
    displayPath: target.displayPath,
    absolutePath: target.absolutePath,
    scope: "machine",
  });
  if (result.unreadable && !(await pathExists(target.absolutePath))) {
    return { findings: [], entryCount: 0, unreadable: false };
  }
  return {
    findings: result.findings,
    entryCount: result.entryCount,
    unreadable: result.unreadable,
  };
}

function shellRcFindings(displayPath: string, content: string): readonly ScanFinding[] {
  return parseShellRcExportKeys(content).flatMap((entry) => {
    const confidence = classifyDotenvKeyName(entry.key);
    return confidence === null ? [] : [shellRcFinding(displayPath, entry.key, confidence)];
  });
}

async function scanShellRcFile(target: MachineScanTarget): Promise<TargetScanOutcome> {
  if (!(await pathExists(target.absolutePath))) {
    return { findings: [], entryCount: 0, unreadable: false };
  }

  try {
    const content = (await readFile(target.absolutePath)).toString("utf8");
    const findings = shellRcFindings(target.displayPath, content);
    return { findings, entryCount: findings.length, unreadable: false };
  } catch {
    return { findings: [], entryCount: 0, unreadable: true };
  }
}

async function scanGenericFile(target: MachineScanTarget): Promise<TargetScanOutcome> {
  const result = await scanFileAtPath({
    displayPath: target.displayPath,
    absolutePath: target.absolutePath,
    scope: "machine",
  });
  return {
    findings: result.findings,
    entryCount: result.entryCount,
    unreadable: result.unreadable,
  };
}

export async function scanMachineTarget(target: MachineScanTarget): Promise<TargetScanOutcome> {
  switch (target.kind) {
    case "fixed-file":
      return scanKnownFixedFile(target);
    case "shell-rc":
      return scanShellRcFile(target);
    case "home-dotenv":
    case "ssh-private-key":
      return scanGenericFile(target);
    default: {
      const exhaustive: never = target.kind;
      throw new Error(`Unhandled machine scan target kind: ${String(exhaustive)}`);
    }
  }
}
