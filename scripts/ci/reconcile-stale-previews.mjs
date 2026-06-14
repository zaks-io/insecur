#!/usr/bin/env node
// Scheduled janitor: delete per-PR preview resources whose PR is no longer open.
// Resolves EVERY resource by its `…-pr-N` name and keeps only PRs in the open set, so it can
// never touch a shared/production Worker, Hyperdrive, or the default Neon branch. This is the
// reconciler the old workflow only stubbed — and where the destructive `list | grep | head -1`
// Hyperdrive delete used to live.
import { execFileSync } from "node:child_process";

import { findHyperdriveByName, parseHyperdriveList, run } from "./lib/hyperdrive.mjs";
import { deleteNeonPrBranch } from "./delete-neon-pr-branch.mjs";

const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
const openPrs = openPullRequestNumbers();

await reconcileWorkers(openPrs);
await reconcileHyperdrives(openPrs);
await reconcileNeonBranches(openPrs);

function openPullRequestNumbers() {
  const out = execFileSync(
    "gh",
    ["pr", "list", "--state", "open", "--limit", "1000", "--json", "number"],
    {
      encoding: "utf8",
    },
  );
  return new Set(JSON.parse(out).map((pr) => String(pr.number)));
}

async function reconcileWorkers(openPrs) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
  const body = await response.json();
  if (!body.success) {
    throw new Error(`Worker script list failed: ${JSON.stringify(body.errors)}`);
  }
  for (const script of body.result ?? []) {
    const pr = previewPrNumber(script.id, /^insecur-(?:api|runtime)-pr-(\d+)$/);
    if (pr && !openPrs.has(pr)) {
      await run("pnpm", ["exec", "wrangler", "delete", "--name", script.id], {
        allowFailure: true,
      });
      process.stdout.write(`Deleted orphaned Worker ${script.id} (PR ${pr} closed)\n`);
    }
  }
}

async function reconcileHyperdrives(openPrs) {
  const result = await run("pnpm", ["exec", "wrangler", "hyperdrive", "list"], {
    allowFailure: true,
  });
  if (result.code !== 0) {
    return;
  }
  for (const config of parseHyperdriveList(result.stdout)) {
    const pr = previewPrNumber(config.name, /^insecur-db-pr-(\d+)$/);
    if (pr && !openPrs.has(pr)) {
      const existing = await findHyperdriveByName(config.name);
      if (existing) {
        await run("pnpm", ["exec", "wrangler", "hyperdrive", "delete", existing.id], {
          allowFailure: true,
        });
        process.stdout.write(`Deleted orphaned Hyperdrive ${config.name} (PR ${pr} closed)\n`);
      }
    }
  }
}

async function reconcileNeonBranches(openPrs) {
  const projectId = process.env.NEON_PROJECT_ID;
  const apiKey = process.env.NEON_API_KEY;
  if (!projectId || !apiKey) {
    process.stdout.write("NEON_PROJECT_ID/NEON_API_KEY unset; skipping Neon branch reconcile.\n");
    return;
  }
  const apiHost = (process.env.NEON_API_HOST ?? "https://console.neon.tech/api/v2").replace(
    /\/$/,
    "",
  );
  const branches = await listNeonBranches({ apiHost, apiKey, projectId });
  for (const branch of branches) {
    const pr = previewPrNumber(branch.name, /^preview\/pr-(\d+)$/);
    if (pr && !openPrs.has(pr) && !branch.default) {
      await deleteNeonPrBranch(pr, { apiHost, apiKey, projectId });
    }
  }
}

async function listNeonBranches({ apiHost, apiKey, projectId }) {
  const url = `${apiHost}/projects/${encodeURIComponent(projectId)}/branches?limit=10000`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
  });
  const body = await response.json();
  return body.branches ?? [];
}

function previewPrNumber(name, pattern) {
  return name.match(pattern)?.[1] ?? null;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name}.`);
  }
  return value;
}
