import { mkdir } from "node:fs/promises";
import path from "node:path";

import {
  createKeyStore,
  resolveKeyStorePaths,
  sealLocalRecord,
  unsealLocalRecord,
  writePrivateKeyFile,
  type KeyStore,
} from "@insecur/local-store";

import { CLI_AGENT_CREDENTIAL_FILE_ENV } from "./agent-env-keys.js";

const DERIVED_AGENT_CREDENTIAL_PREFIX = "agent-derived.";

interface SealedAgentCredentialRecord {
  readonly credential: string;
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly host: string;
}

export interface AgentCredentialStore {
  save(record: SealedAgentCredentialRecord): Promise<string>;
  load(filePath: string): Promise<SealedAgentCredentialRecord | undefined>;
}

function readSealedAgentCredentialRecord(
  record: Record<string, unknown>,
): SealedAgentCredentialRecord | undefined {
  if (
    typeof record.credential !== "string" ||
    typeof record.sessionId !== "string" ||
    typeof record.expiresAt !== "string" ||
    typeof record.host !== "string"
  ) {
    return undefined;
  }
  return {
    credential: record.credential,
    sessionId: record.sessionId,
    expiresAt: record.expiresAt,
    host: record.host,
  };
}

function parseRecord(raw: string): SealedAgentCredentialRecord | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return undefined;
    }
    const record = readSealedAgentCredentialRecord(parsed as Record<string, unknown>);
    if (record === undefined) {
      return undefined;
    }
    if (Date.parse(record.expiresAt) <= Date.now()) {
      return undefined;
    }
    return record;
  } catch {
    return undefined;
  }
}

function createAgentCredentialStore(keyStore?: KeyStore): AgentCredentialStore {
  let keyStoreInstance: KeyStore | undefined = keyStore;
  const store = (): KeyStore => (keyStoreInstance ??= createKeyStore());

  return {
    async save(record: SealedAgentCredentialRecord): Promise<string> {
      const keyHex = await store().getOrCreateMachineRootKey();
      const sealed = sealLocalRecord(keyHex, JSON.stringify(record));
      const filePath = path.join(
        resolveKeyStorePaths().userConfigDir,
        `${DERIVED_AGENT_CREDENTIAL_PREFIX}${record.sessionId}.sealed`,
      );
      await mkdir(path.dirname(filePath), { recursive: true });
      await writePrivateKeyFile(filePath, sealed);
      return filePath;
    },

    async load(filePath: string): Promise<SealedAgentCredentialRecord | undefined> {
      const keyHex = await store().getOrCreateMachineRootKey();
      const { readFile } = await import("node:fs/promises");
      let sealed: string;
      try {
        sealed = await readFile(filePath, "utf8");
      } catch {
        return undefined;
      }
      try {
        return parseRecord(unsealLocalRecord(keyHex, sealed));
      } catch {
        return undefined;
      }
    },
  };
}

let activeStore: AgentCredentialStore | undefined;

function defaultAgentCredentialStore(): AgentCredentialStore {
  activeStore ??= createAgentCredentialStore();
  return activeStore;
}

export async function resolveAgentCredentialFromEnv(
  host: string,
  store: AgentCredentialStore = defaultAgentCredentialStore(),
): Promise<string | undefined> {
  const filePath = process.env[CLI_AGENT_CREDENTIAL_FILE_ENV];
  if (filePath === undefined || filePath.trim() === "") {
    return undefined;
  }
  const record = await store.load(filePath);
  if (record?.host !== host) {
    return undefined;
  }
  return record.credential;
}

export async function writeAgentCredentialFile(
  record: SealedAgentCredentialRecord,
  store: AgentCredentialStore = defaultAgentCredentialStore(),
): Promise<string> {
  return store.save(record);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function formatAgentEnvExports(exports: Record<string, string>): string {
  return Object.entries(exports)
    .map(([name, value]) => `export ${name}=${shellQuote(value)}`)
    .join("\n");
}
