import { readFile, stat } from "node:fs/promises";
import type { MachineScanTarget } from "./machine-locations.js";
import {
  awsCredentialsFinding,
  scanFileAtPath,
  shellRcFinding,
  toWholeFileFinding,
} from "./scan-file.js";
import { isFsEnoent } from "./machine-target-listing.js";
import { parseShellRcExportKeys } from "./shell-rc-parser.js";
import type { ScanFinding } from "./types.js";

export type TargetScanOutcome =
  | { readonly status: "missing" }
  | { readonly status: "unreadable" }
  | {
      readonly status: "scanned";
      readonly findings: readonly ScanFinding[];
      readonly entryCount: number;
    };

async function statPath(absolutePath: string): Promise<"missing" | "present" | "unreadable"> {
  try {
    await stat(absolutePath);
    return "present";
  } catch (error) {
    if (isFsEnoent(error)) {
      return "missing";
    }
    return "unreadable";
  }
}

async function outcomeWhenPresent(
  absolutePath: string,
  scanPresent: () => Promise<TargetScanOutcome>,
): Promise<TargetScanOutcome> {
  const pathState = await statPath(absolutePath);
  if (pathState === "missing") {
    return { status: "missing" };
  }
  if (pathState === "unreadable") {
    return { status: "unreadable" };
  }
  return scanPresent();
}

function isAwsCredentialsPath(displayPath: string): boolean {
  return displayPath === "~/.aws/credentials" || displayPath.endsWith("/.aws/credentials");
}

function isDockerConfigPath(displayPath: string): boolean {
  return displayPath === "~/.docker/config.json" || displayPath.endsWith("/.docker/config.json");
}

function scanned(
  findings: readonly ScanFinding[],
  entryCount = findings.length,
): TargetScanOutcome {
  return { status: "scanned", findings, entryCount };
}

async function scanFileAtPathOutcome(target: MachineScanTarget): Promise<TargetScanOutcome> {
  return outcomeWhenPresent(target.absolutePath, async () => {
    const result = await scanFileAtPath({
      displayPath: target.displayPath,
      absolutePath: target.absolutePath,
      scope: "machine",
    });
    if (result.unreadable) {
      return { status: "unreadable" };
    }
    return scanned(result.findings, result.entryCount);
  });
}

async function scanKnownFixedFile(target: MachineScanTarget): Promise<TargetScanOutcome> {
  if (isAwsCredentialsPath(target.displayPath)) {
    return outcomeWhenPresent(target.absolutePath, () =>
      Promise.resolve(scanned([awsCredentialsFinding(target.displayPath)], 1)),
    );
  }
  if (isDockerConfigPath(target.displayPath)) {
    return outcomeWhenPresent(target.absolutePath, () =>
      Promise.resolve(
        scanned(
          [
            toWholeFileFinding(target.displayPath, "machine", "credential-json", {
              key: "config.json",
            }),
          ],
          1,
        ),
      ),
    );
  }
  return scanFileAtPathOutcome(target);
}

async function scanShellRcFile(target: MachineScanTarget): Promise<TargetScanOutcome> {
  return outcomeWhenPresent(target.absolutePath, async () => {
    try {
      const content = (await readFile(target.absolutePath)).toString("utf8");
      const findings = parseShellRcExportKeys(content).map((entry) =>
        shellRcFinding(target.displayPath, entry.key, entry.confidence),
      );
      return scanned(findings);
    } catch {
      return { status: "unreadable" };
    }
  });
}

export async function scanMachineTarget(target: MachineScanTarget): Promise<TargetScanOutcome> {
  switch (target.kind) {
    case "fixed-file":
      return scanKnownFixedFile(target);
    case "shell-rc":
      return scanShellRcFile(target);
    case "home-dotenv":
    case "ssh-private-key":
      return scanFileAtPathOutcome(target);
    default: {
      const exhaustive: never = target.kind;
      throw new Error(`Unhandled machine scan target kind: ${String(exhaustive)}`);
    }
  }
}
