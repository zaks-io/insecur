import { readFile, unlink } from "node:fs/promises";
import path from "node:path";

import {
  createKeyStore,
  KeyStoreError,
  resolveKeyStorePaths,
  sealLocalRecord,
  unsealLocalRecord,
  writePrivateKeyFile,
  type KeyStore,
  type KeyStoreNotice,
} from "@insecur/local-store";

/** Sealed session record file under the insecur user config directory. */
export const SESSION_FILE_NAME = "session.v1.sealed";

export interface PersistedSession {
  readonly credential: string;
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly host: string;
}

export interface SessionStore {
  notice(): KeyStoreNotice | null;
  save(session: PersistedSession): Promise<void>;
  /** Returns the persisted session for the host, discarding expired or unreadable records. */
  load(host: string): Promise<PersistedSession | undefined>;
  /** Removes the persisted record. Returns true when a record existed. */
  clear(): Promise<boolean>;
}

export interface CreateSessionStoreOptions {
  readonly keyStore?: KeyStore;
  readonly sessionFilePath?: string;
  readonly now?: () => number;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

const SESSION_RECORD_FIELDS = ["credential", "sessionId", "expiresAt", "host"] as const;

function tryParseJson(recordJson: string): unknown {
  try {
    return JSON.parse(recordJson);
  } catch {
    return undefined;
  }
}

function parsePersistedSession(recordJson: string): PersistedSession | undefined {
  const parsed = tryParseJson(recordJson);
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  const isValid = SESSION_RECORD_FIELDS.every(
    (field) => typeof record[field] === "string" && record[field] !== "",
  );
  if (!isValid) {
    return undefined;
  }
  return {
    credential: record.credential as string,
    sessionId: record.sessionId as string,
    expiresAt: record.expiresAt as string,
    host: record.host as string,
  };
}

function isExpired(expiresAt: string, nowMs: number): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isNaN(expiresAtMs) || expiresAtMs <= nowMs;
}

async function readSessionFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }
}

function unsealSession(keyHex: string, sealed: string): PersistedSession | undefined {
  try {
    return parsePersistedSession(unsealLocalRecord(keyHex, sealed));
  } catch (error) {
    if (!(error instanceof KeyStoreError)) {
      throw error;
    }
    return undefined;
  }
}

async function removeSessionFile(filePath: string): Promise<boolean> {
  try {
    await unlink(filePath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    throw error;
  }
}

export function createSessionStore(options: CreateSessionStoreOptions = {}): SessionStore {
  let keyStoreInstance: KeyStore | undefined = options.keyStore;
  const keyStore = (): KeyStore => (keyStoreInstance ??= createKeyStore());
  const sessionFilePath =
    options.sessionFilePath ?? path.join(resolveKeyStorePaths().userConfigDir, SESSION_FILE_NAME);
  const now = options.now ?? Date.now;

  return {
    notice: () => keyStore().notice,

    async save(session: PersistedSession): Promise<void> {
      const keyHex = await keyStore().getOrCreateMachineRootKey();
      const sealed = sealLocalRecord(keyHex, JSON.stringify(session));
      await writePrivateKeyFile(sessionFilePath, sealed);
    },

    async load(host: string): Promise<PersistedSession | undefined> {
      const sealed = await readSessionFile(sessionFilePath);
      if (sealed === undefined) {
        return undefined;
      }
      const keyHex = await keyStore().getOrCreateMachineRootKey();
      const session = unsealSession(keyHex, sealed);
      if (session === undefined || isExpired(session.expiresAt, now())) {
        await removeSessionFile(sessionFilePath);
        return undefined;
      }
      return session.host === host ? session : undefined;
    },

    async clear(): Promise<boolean> {
      return removeSessionFile(sessionFilePath);
    },
  };
}

let activeSessionStore: SessionStore | undefined;

export function defaultSessionStore(): SessionStore {
  activeSessionStore ??= createSessionStore();
  return activeSessionStore;
}
