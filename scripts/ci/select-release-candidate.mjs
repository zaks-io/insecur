#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const PRODUCTION_HEALTH_TARGETS = [
  ["insecur-api", "https://api.insecur.cloud/healthz"],
  ["insecur-web", "https://app.insecur.cloud/healthz"],
  ["insecur-site", "https://insecur.cloud/healthz"],
];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${message}`);
    process.exit(1);
  });
}

async function main() {
  const repository = requireEnv("GITHUB_REPOSITORY");
  const token = requireEnv("GH_TOKEN");
  const outputPath = requireEnv("GITHUB_OUTPUT");
  const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const headers = githubHeaders(token);

  const runs = await fetchJson(
    `${apiUrl}/repos/${repository}/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=100`,
    headers,
  );
  const mainSha = git("rev-parse", "origin/main");
  const productionSha = git("rev-parse", "origin/production");
  const mainHistory = git("rev-list", "origin/main").split("\n");
  const candidate = selectNewestSuccessfulMainRun(runs.workflow_runs, mainHistory);

  const relation = assertReleaseAncestry({
    candidateSha: candidate.head_sha,
    mainSha,
    productionSha,
    isAncestor: (ancestor, descendant) =>
      gitStatus("merge-base", "--is-ancestor", ancestor, descendant) === 0,
  });

  const live = await readProductionIdentity();
  const verifiedLiveRun = live
    ? await productionJobSucceeded({ apiUrl, headers, repository, runId: live.runId })
    : false;
  const action = decideReleaseAction({
    candidateSha: candidate.head_sha,
    liveSha: live?.deploySha,
    productionSha,
    relation,
    verifiedLiveRun,
  });

  const output = {
    action,
    ci_run_id: String(candidate.id),
    deploy_sha: candidate.head_sha,
    production_sha: productionSha,
  };
  await appendFile(
    outputPath,
    Object.entries(output)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
  );
  await writeFile("release-candidate.json", `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    `Release candidate ${candidate.head_sha} from CI run ${candidate.id}: action=${action}.`,
  );
}

export function selectNewestSuccessfulMainRun(runs, mainHistory = []) {
  if (!Array.isArray(runs)) throw new Error("CI workflow response did not contain workflow_runs.");
  const candidates = runs
    .filter(
      (run) =>
        run?.conclusion === "success" &&
        run?.event === "push" &&
        run?.head_branch === "main" &&
        isCommitSha(run?.head_sha) &&
        Number.isSafeInteger(run?.id),
    )
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at));
  if (candidates.length === 0) {
    throw new Error("No completed successful CI run was found for main.");
  }
  const newestBySha = new Map();
  for (const run of candidates) {
    if (!newestBySha.has(run.head_sha)) newestBySha.set(run.head_sha, run);
  }
  for (const sha of mainHistory) {
    const run = newestBySha.get(sha);
    if (run) return run;
  }
  throw new Error("No successful CI run belongs to the current main history.");
}

export function assertReleaseAncestry({ candidateSha, isAncestor, mainSha, productionSha }) {
  if (!isAncestor(candidateSha, mainSha)) {
    throw new Error(`Release candidate ${candidateSha} is not an ancestor of main ${mainSha}.`);
  }
  if (!isAncestor(productionSha, mainSha)) {
    throw new Error(`Production ${productionSha} is not an ancestor of main ${mainSha}.`);
  }
  if (productionSha === candidateSha) return "same";
  if (!isAncestor(productionSha, candidateSha)) {
    if (isAncestor(candidateSha, productionSha)) return "production-ahead";
    throw new Error(
      `Production ${productionSha} and release candidate ${candidateSha} have diverged.`,
    );
  }
  return "candidate-ahead";
}

export function decideReleaseAction({
  candidateSha,
  liveSha,
  productionSha,
  relation,
  verifiedLiveRun,
}) {
  if (relation === "production-ahead") {
    if (liveSha === productionSha && verifiedLiveRun) return "noop";
    throw new Error("Production ledger is ahead, but its live deployment is not verified.");
  }
  if (candidateSha === productionSha && liveSha === candidateSha && verifiedLiveRun) return "noop";
  if (liveSha === candidateSha && verifiedLiveRun) return "record";
  if (candidateSha === productionSha) return "deploy";
  return "deploy";
}

export function parseHealthIdentities(results) {
  if (!Array.isArray(results) || results.length !== PRODUCTION_HEALTH_TARGETS.length) return null;
  const identities = results.map(({ expectedService, value }) => {
    if (
      value?.ok !== true ||
      value?.service !== expectedService ||
      !isCommitSha(value?.deploySha) ||
      !/^\d+$/u.test(String(value?.runId ?? ""))
    ) {
      return null;
    }
    return { deploySha: value.deploySha, runId: String(value.runId) };
  });
  if (identities.some((identity) => identity === null)) return null;
  const [first] = identities;
  if (
    identities.some(
      (identity) => identity.deploySha !== first.deploySha || identity.runId !== first.runId,
    )
  ) {
    return null;
  }
  return first;
}

async function readProductionIdentity() {
  const results = await Promise.all(
    PRODUCTION_HEALTH_TARGETS.map(async ([expectedService, url]) => {
      try {
        return { expectedService, value: await fetchJson(url, {}, 5_000) };
      } catch {
        return { expectedService, value: null };
      }
    }),
  );
  return parseHealthIdentities(results);
}

async function productionJobSucceeded({ apiUrl, headers, repository, runId }) {
  try {
    const response = await fetchJson(
      `${apiUrl}/repos/${repository}/actions/runs/${runId}/jobs?per_page=100`,
      headers,
    );
    return response.jobs?.some(
      (job) => job.conclusion === "success" && /(^| \/ )Deploy Production$/u.test(job.name),
    );
  } catch {
    return false;
  }
}

async function fetchJson(url, headers = {}, timeout = 15_000) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
  return response.json();
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function gitStatus(...args) {
  try {
    execFileSync("git", args, { stdio: "ignore" });
    return 0;
  } catch (error) {
    return typeof error?.status === "number" ? error.status : 1;
  }
}

function isCommitSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
