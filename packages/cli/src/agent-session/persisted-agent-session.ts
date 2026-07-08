import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { AgentSessionId } from "@insecur/domain";
import { resolveKeyStorePaths } from "@insecur/local-store";

const AGENT_SESSION_STATE_FILE = "agent-sessions.v1.json";

interface AgentSessionStateRecord {
  readonly agentSessionId: AgentSessionId;
  readonly harnessName?: string;
}

export interface AgentSessionStateStore {
  load(key: string): Promise<AgentSessionStateRecord | undefined>;
  save(key: string, record: AgentSessionStateRecord): Promise<void>;
}

function agentSessionStatePath(): string {
  return path.join(resolveKeyStorePaths().userConfigDir, AGENT_SESSION_STATE_FILE);
}

function parseStateFile(raw: string): Record<string, AgentSessionStateRecord> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    return parsed as Record<string, AgentSessionStateRecord>;
  } catch {
    return {};
  }
}

async function readStateFile(): Promise<Record<string, AgentSessionStateRecord>> {
  try {
    const raw = await readFile(agentSessionStatePath(), "utf8");
    return parseStateFile(raw);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return {};
    }
    throw error;
  }
}

export function buildAgentSessionStateKey(input: {
  readonly host: string;
  readonly sessionId: string;
  readonly parentProcessId: number;
}): string {
  return `${input.host}|${input.sessionId}|${String(input.parentProcessId)}`;
}

function createAgentSessionStateStore(): AgentSessionStateStore {
  return {
    async load(key: string): Promise<AgentSessionStateRecord | undefined> {
      const records = await readStateFile();
      return records[key];
    },

    async save(key: string, record: AgentSessionStateRecord): Promise<void> {
      const records = await readStateFile();
      records[key] = record;
      const filePath = agentSessionStatePath();
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, `${JSON.stringify(records)}\n`, { mode: 0o600 });
    },
  };
}

let activeAgentSessionStateStore: AgentSessionStateStore | undefined;

export function defaultAgentSessionStateStore(): AgentSessionStateStore {
  activeAgentSessionStateStore ??= createAgentSessionStateStore();
  return activeAgentSessionStateStore;
}
