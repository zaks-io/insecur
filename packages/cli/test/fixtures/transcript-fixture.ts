import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  SENTINEL_DECOY_VALUE,
  SENTINEL_LOCAL_VALUE,
  SENTINEL_SECRET_VALUE,
  writeScanFixtureTree,
} from "./scan-fixture.js";

/** Obviously fake sentinel — must not resemble real secret prefixes. */
export const SENTINEL_TRANSCRIPT_ONLY_VALUE = "SENTINEL_TRANSCRIPT_HEURISTIC_ALPHA_3e8b1d";

export interface TranscriptFixtureLayout {
  readonly homeDir: string;
  readonly projectRoot: string;
}

async function writeCursorTranscriptFixture(homeDir: string): Promise<void> {
  const cursorTranscriptDir = join(
    homeDir,
    ".cursor",
    "projects",
    "workspace",
    "agent-transcripts",
  );
  await mkdir(cursorTranscriptDir, { recursive: true });
  await writeFile(
    join(cursorTranscriptDir, "11111111-1111-4111-8111-111111111111.jsonl"),
    [
      JSON.stringify({ role: "user", text: "please check my env" }),
      JSON.stringify({
        role: "assistant",
        text: `The API secret is ${SENTINEL_SECRET_VALUE} in your .env file.`,
      }),
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(cursorTranscriptDir, "decoy.jsonl"),
    JSON.stringify({ role: "assistant", text: `decoy ${SENTINEL_DECOY_VALUE}` }),
    "utf8",
  );
}

async function writeClaudeTranscriptFixture(homeDir: string): Promise<void> {
  const claudeProjectDir = join(homeDir, ".claude", "projects", "-workspace-project");
  await mkdir(claudeProjectDir, { recursive: true });
  await writeFile(
    join(claudeProjectDir, "22222222-2222-4222-8222-222222222222.jsonl"),
    [
      JSON.stringify({ type: "user", message: { content: "show database password" } }),
      JSON.stringify({
        type: "assistant",
        message: { content: `DATABASE_PASSWORD=${SENTINEL_LOCAL_VALUE}` },
      }),
    ].join("\n"),
    "utf8",
  );
}

async function writeCodexTranscriptFixture(homeDir: string): Promise<void> {
  const codexSessionDir = join(homeDir, ".codex", "sessions", "2026", "07", "07");
  await mkdir(codexSessionDir, { recursive: true });
  await writeFile(
    join(codexSessionDir, "rollout-2026-07-07T09-00-00-33333333-3333-4333-8333-333333333333.jsonl"),
    [
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "user_message",
          message: `export API_KEY=${SENTINEL_TRANSCRIPT_ONLY_VALUE}`,
        },
      }),
    ].join("\n"),
    "utf8",
  );
}

export async function writeTranscriptScanFixtures(
  baseDir: string,
): Promise<TranscriptFixtureLayout> {
  const homeDir = join(baseDir, "home");
  const projectRoot = join(baseDir, "project");
  await mkdir(projectRoot, { recursive: true });
  await writeScanFixtureTree(projectRoot);
  await writeCursorTranscriptFixture(homeDir);
  await writeClaudeTranscriptFixture(homeDir);
  await writeCodexTranscriptFixture(homeDir);
  return { homeDir, projectRoot };
}

export async function writeCustomTranscriptFixture(
  baseDir: string,
  fileName: string,
  body: string,
): Promise<string> {
  const exportsDir = join(baseDir, "exports");
  await mkdir(exportsDir, { recursive: true });
  const absolutePath = join(exportsDir, fileName);
  await writeFile(absolutePath, body, "utf8");
  return absolutePath;
}
