#!/usr/bin/env node
// Fail when a GitHub Action is referenced by floating tag instead of commit SHA.
// Local ./.github/actions/* composite actions are exempt.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const githubDir = join(repoRoot, ".github");
const usesPattern = /^\s*uses:\s+([^\s#]+)(?:\s+#\s*(.+))?$/;
const shaPattern = /^[0-9a-f]{40}$/i;
const workflowFilePattern = /\.ya?ml$/;

const failures = [];

function collectYamlFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectYamlFiles(path));
      continue;
    }
    if (workflowFilePattern.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

for (const filePath of collectYamlFiles(githubDir)) {
  const relPath = filePath.slice(repoRoot.length + 1);
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

    const ref = actionRef.includes("@") ? actionRef.slice(actionRef.lastIndexOf("@") + 1) : "";
    if (shaPattern.test(ref)) {
      continue;
    }

    failures.push(
      `${relPath}:${index + 1}: action ${actionRef} must be pinned to a full commit SHA` +
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
