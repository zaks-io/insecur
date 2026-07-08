#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildReleaseNotesMarkdown,
  CLI_RELEASE_PATHS,
  DEFAULT_ANTHROPIC_MODEL,
  generateCliReleaseNotes,
  parseGitLog,
} from "./cli-release-notes-lib.mjs";
import { execFileForOutput } from "./exec-file-output.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function parseArgs(argv) {
  const args = { output: "dist-binaries/RELEASE_NOTES.md" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--tag" && value) {
      args.tag = value;
      index += 1;
    } else if (arg === "--release-sha" && value) {
      args.releaseSha = value;
      index += 1;
    } else if (arg === "--output" && value) {
      args.output = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  if (!args.tag) {
    throw new Error("--tag is required");
  }
  if (!args.releaseSha) {
    throw new Error("--release-sha is required");
  }
  return args;
}

export async function resolvePreviousCliTag(tag, options = {}) {
  const tagList = await git(["tag", "-l", "cli-v*", "--sort=-version:refname"], options);
  return (
    tagList
      .split(/\r?\n/u)
      .map((candidate) => candidate.trim())
      .filter(Boolean)
      .find((candidate) => candidate !== tag) ?? null
  );
}

export async function collectCliReleaseCommits(logRange, options = {}) {
  const output = await git(
    [
      "log",
      "--no-merges",
      "--format=commit:%H%x1f%s",
      "--name-only",
      logRange,
      "--",
      ...CLI_RELEASE_PATHS,
    ],
    options,
  );
  return parseGitLog(output);
}

async function git(args, options = {}) {
  const result = await execFileForOutput("git", args, {
    cwd: options.cwd ?? REPO_ROOT,
    execFileAsync: options.execFileAsync,
    failureMessage: "git exited with a non-zero status",
    maxBuffer: 10 * 1024 * 1024,
  });
  return result.stdout.trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const previousTag = await resolvePreviousCliTag(args.tag);
  const commits = previousTag
    ? await collectCliReleaseCommits(`${previousTag}..${args.releaseSha}`)
    : [];
  const result = await generateCliReleaseNotes(
    {
      tag: args.tag,
      releaseSha: args.releaseSha,
      previousTag,
      commits,
    },
    {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      anthropicModel: process.env.ANTHROPIC_MODEL,
    },
  );

  logGenerationSource(result.source);

  const outputPath = path.resolve(REPO_ROOT, args.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buildReleaseNotesMarkdown(result.notes), "utf8");
}

function logGenerationSource(source) {
  if (source === "deterministic") {
    console.log(
      "::notice::ANTHROPIC_API_KEY is not configured; using deterministic CLI source-path release notes.",
    );
  } else if (source === "initial") {
    console.log("::notice::No previous cli-v* tag found; using initial CLI release notes.");
  } else if (source === "empty") {
    console.log("::notice::No shipped CLI code changes found for this release range.");
  } else {
    console.log(
      `Generated CLI release notes with ${process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL}.`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
