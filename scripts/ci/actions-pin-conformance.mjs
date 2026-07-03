#!/usr/bin/env node
// Fail when a third-party GitHub Action is referenced by floating tag instead of commit SHA.
// First-party actions/* may stay on @vN per supply-chain posture (ADR-0056, INS-280).

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflowsDir = join(repoRoot, ".github", "workflows");
const usesPattern = /^\s*uses:\s+([^\s#]+)(?:\s+#\s*(.+))?$/;
const shaPattern = /^[0-9a-f]{40}$/i;

const failures = [];

const workflowFilePattern = /\.ya?ml$/;

for (const fileName of readdirSync(workflowsDir).filter((name) => workflowFilePattern.test(name))) {
  const filePath = join(workflowsDir, fileName);
  const lines = readFileSync(filePath, "utf8").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(usesPattern);
    if (!match) {
      continue;
    }

    const [, actionRef, comment = ""] = match;
    if (actionRef.startsWith("./") || actionRef.startsWith("../")) {
      continue;
    }

    const [owner] = actionRef.split("/");
    if (owner === "actions") {
      continue;
    }

    const ref = actionRef.includes("@") ? actionRef.slice(actionRef.lastIndexOf("@") + 1) : "";
    if (shaPattern.test(ref)) {
      continue;
    }

    failures.push(
      `${fileName}:${index + 1}: third-party action ${actionRef} must be pinned to a full commit SHA` +
        (comment ? ` (comment: ${comment.trim()})` : ""),
    );
  }
}

if (failures.length > 0) {
  console.error("actions-pin conformance failed:\n");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("actions-pin conformance passed.");
