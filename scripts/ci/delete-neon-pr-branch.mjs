#!/usr/bin/env node
// Delete the ephemeral Neon branch for a closed PR preview. Idempotent: a missing
// branch is a no-op. Refuses to delete the project default branch. Ported from the
// agent-paste preview-env teardown pattern.
import { fileURLToPath } from "node:url";

if (isMain(import.meta.url)) {
  const prNumber = process.env.PR_NUMBER ?? process.argv[2];
  const context = {
    apiHost: (process.env.NEON_API_HOST ?? "https://console.neon.tech/api/v2").replace(/\/$/, ""),
    apiKey: requiredEnv("NEON_API_KEY"),
    projectId: requiredEnv("NEON_PROJECT_ID"),
  };

  deleteNeonPrBranch(prNumber, context).catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

export async function deleteNeonPrBranch(prNumber, context, options = {}) {
  const branchName = `preview/pr-${normalizePrNumber(prNumber)}`;
  const fetchFn = options.fetch ?? fetch;
  const log = options.log ?? ((message) => process.stdout.write(message));
  const headers = neonHeaders(context.apiKey);

  const branch = await findBranchByName({ fetchFn, headers, branchName, ...context });
  if (!branch) {
    log(`Neon branch ${branchName} not found (already removed)\n`);
    return { deleted: false, branchName };
  }
  if (branch.default) {
    throw new Error(`Refusing to delete default Neon branch ${branchName} (${branch.id}).`);
  }

  await deleteBranchById({ fetchFn, headers, branchName, branch, ...context });
  log(`Deleted Neon branch ${branchName} (${branch.id})\n`);
  return { deleted: true, branchName, branchId: branch.id };
}

async function deleteBranchById({ fetchFn, headers, branchName, branch, apiHost, projectId }) {
  const url = `${apiHost}/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branch.id)}`;
  const response = await fetchFn(url, { method: "DELETE", headers });
  if (response.status === 204 || response.status === 404) {
    return;
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Neon branch delete failed for ${branchName} (${branch.id}): ${response.status} ${body}`,
    );
  }
}

async function findBranchByName({ fetchFn, headers, branchName, apiHost, projectId }) {
  const url = new URL(`${apiHost}/projects/${encodeURIComponent(projectId)}/branches`);
  url.searchParams.set("search", branchName);
  url.searchParams.set("limit", "10000");

  const response = await fetchFn(url, { headers });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Neon branch list failed: ${response.status} ${body}`);
  }

  const payload = body ? JSON.parse(body) : {};
  const branches = Array.isArray(payload.branches) ? payload.branches : [];
  return branches.find((branch) => branch.name === branchName) ?? null;
}

function neonHeaders(apiKey) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export function normalizePrNumber(prNumber) {
  if (!prNumber || !/^[1-9][0-9]*$/.test(String(prNumber))) {
    throw new Error("Set PR_NUMBER or pass a positive integer PR number as the first argument.");
  }
  return String(prNumber);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name}.`);
  }
  return value;
}

function isMain(metaUrl) {
  return process.argv[1] === fileURLToPath(metaUrl);
}
