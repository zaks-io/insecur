#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

import { assertFullCommitSha, extractReleaseSourceSha } from "./cli-release-notes-lib.mjs";
import { execFileForOutput } from "./exec-file-output.mjs";
import { parseFlagArgs } from "./parse-flag-args.mjs";

export function parseArgs(argv) {
  const args = parseFlagArgs(argv, {
    flags: { "--tag": "tag", "--source-sha": "sourceSha" },
    required: ["tag", "sourceSha"],
  });
  assertFullCommitSha(args.sourceSha);
  return args;
}

export async function fetchRelease(tag, options = {}) {
  const result = await execFileForOutput("gh", ["release", "view", tag, "--json", "isDraft,body"], {
    execFileAsync: options.execFileAsync,
    failureMessage: `gh release view ${tag} exited with a non-zero status`,
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(result.stdout);
}

export function assertDraftBoundToSourceSha({ tag, isDraft, body, sourceSha }) {
  if (isDraft !== true) {
    throw new Error(
      `Release ${tag} is published; refusing to mutate published release assets. Bump packages/cli/package.json to prepare a new release.`,
    );
  }
  const recordedSha = extractReleaseSourceSha(body);
  if (recordedSha === null) {
    throw new Error(
      `Draft release ${tag} has no recorded source SHA marker, so its provenance cannot be verified. Delete the draft and re-dispatch CLI Release from main to rebuild it.`,
    );
  }
  if (recordedSha !== sourceSha) {
    throw new Error(
      `Draft release ${tag} is bound to source SHA ${recordedSha}; refusing to mutate it from ${sourceSha}. Delete the draft and re-dispatch CLI Release from main to rebuild it.`,
    );
  }
  return recordedSha;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const release = await fetchRelease(args.tag);
  assertDraftBoundToSourceSha({
    tag: args.tag,
    isDraft: release.isDraft,
    body: release.body,
    sourceSha: args.sourceSha,
  });
  console.log(
    `Draft release ${args.tag} is bound to source SHA ${args.sourceSha}; mutation allowed.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
