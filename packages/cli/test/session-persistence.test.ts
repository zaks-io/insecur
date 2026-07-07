import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTH_ERROR_CODES, successEnvelope } from "@insecur/domain";
import { createFakeKeyStore, generateMachineRootKeyHex } from "@insecur/local-store";
import { requireSessionCredential } from "../src/auth/require-session.js";
import { runLoginCommand } from "../src/commands/login.js";
import { runLogoutCommand } from "../src/commands/logout.js";
import type { ApiClient } from "../src/api/types.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_AUTH_REQUIRED } from "../src/output/exit-codes.js";
import { clearMemorySession, setMemorySession } from "../src/session/memory-session.js";
import {
  createSessionStore,
  SESSION_FILE_NAME,
  type PersistedSession,
  type SessionStore,
} from "../src/session/persisted-session.js";

const host = "https://insecur.test";
const sensitiveCredential = "insecur-session-credential-test-value";

const flags = {
  host,
  orgId: undefined,
  projectId: undefined,
  envId: undefined,
  profile: undefined,
  profileId: undefined,
  configDir: undefined,
  json: true,
  quiet: true,
  verbose: false,
};

const keyStore = createFakeKeyStore({ keyHex: generateMachineRootKeyHex() });

let sessionFilePath: string;
let store: SessionStore;

function sessionRecord(overrides: Partial<PersistedSession> = {}): PersistedSession {
  return {
    credential: sensitiveCredential,
    sessionId: "sess_cli_persist",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    host,
    ...overrides,
  };
}

beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "insecur-cli-session-"));
  sessionFilePath = path.join(dir, SESSION_FILE_NAME);
  store = createSessionStore({ keyStore, sessionFilePath });
});

afterEach(() => {
  clearMemorySession();
  delete process.env.INSECUR_SESSION_TOKEN;
});

describe("persisted session store", () => {
  it("round-trips a session record without plaintext at rest", async () => {
    const record = sessionRecord();
    await store.save(record);
    const contents = await readFile(sessionFilePath, "utf8");
    expect(contents).not.toContain(sensitiveCredential);
    expect(contents).not.toContain("sess_cli_persist");
    if (process.platform !== "win32") {
      expect((await stat(sessionFilePath)).mode & 0o777).toBe(0o600);
    }
    await expect(store.load(host)).resolves.toEqual(record);
  });

  it("ignores records for a different host", async () => {
    await store.save(sessionRecord());
    await expect(store.load("https://other.test")).resolves.toBeUndefined();
    await expect(store.load(host)).resolves.toBeDefined();
  });

  it("discards expired records and removes the file", async () => {
    await store.save(sessionRecord({ expiresAt: new Date(Date.now() - 1_000).toISOString() }));
    await expect(store.load(host)).resolves.toBeUndefined();
    await expect(readFile(sessionFilePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("discards corrupt records and removes the file", async () => {
    await writeFile(sessionFilePath, "insecur.sealed.v1:garbage", "utf8");
    await expect(store.load(host)).resolves.toBeUndefined();
    await expect(readFile(sessionFilePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("clear removes the record and reports whether one existed", async () => {
    await store.save(sessionRecord());
    await expect(store.clear()).resolves.toBe(true);
    await expect(store.clear()).resolves.toBe(false);
  });
});

describe("credential resolution order", () => {
  it("falls back to the persisted record when memory and env are empty", async () => {
    await store.save(sessionRecord());
    await expect(requireSessionCredential(host, store)).resolves.toBe(sensitiveCredential);
  });

  it("prefers process memory over the persisted record", async () => {
    await store.save(sessionRecord());
    setMemorySession({
      credential: "memory-credential",
      sessionId: "sess_memory",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await expect(requireSessionCredential(host, store)).resolves.toBe("memory-credential");
  });

  it("prefers INSECUR_SESSION_TOKEN over the persisted record", async () => {
    await store.save(sessionRecord());
    process.env.INSECUR_SESSION_TOKEN = "env-credential";
    await expect(requireSessionCredential(host, store)).resolves.toBe("env-credential");
  });

  it("fails with auth.required when nothing is available", async () => {
    await expect(requireSessionCredential(host, store)).rejects.toMatchObject({
      exitCode: EXIT_AUTH_REQUIRED,
      code: AUTH_ERROR_CODES.required,
    } satisfies Partial<CliError>);
  });
});

function ignoreCallbackFetchError(error: unknown): void {
  void error;
}

function completeLoginCallback(callback: URL): void {
  queueMicrotask(() => {
    void fetch(callback).catch(ignoreCallbackFetchError);
  });
}

function createMockApi(): ApiClient {
  return {
    createCliAuthorizationUrl(input) {
      const callback = new URL(input.redirectUri);
      callback.searchParams.set("code", "code_mock_login");
      callback.searchParams.set("state", input.state);
      completeLoginCallback(callback);
      return "https://workos.test/authorize";
    },
    async exchangeCliPkceSession() {
      return {
        ok: true,
        credential: sensitiveCredential,
        envelope: successEnvelope({
          sessionId: "sess_cli_persist",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      };
    },
    async provisionPersonalOrganization() {
      throw new Error("not used");
    },
    async writeSecretByVariableKey() {
      throw new Error("not used");
    },
    async issueInjectionGrant() {
      throw new Error("not used");
    },
    async consumeInjectionGrant() {
      throw new Error("not used");
    },
    async consumeInjectionGrantAll() {
      throw new Error("not used");
    },
    async revokeCliSession() {
      return { ok: true, envelope: successEnvelope({ revoked: true }) };
    },
  };
}

function mockContext(): ResolvedCliContext {
  return {
    projectConfig: null,
    userConfig: { profiles: {} },
    scope: {
      host,
      orgId: undefined,
      projectId: undefined,
      envId: undefined,
      profileId: undefined,
      profileSlug: undefined,
      profile: undefined,
    },
  };
}

describe("login and logout persistence", () => {
  it("login persists the session by default and logout removes it", async () => {
    const exitCode = await runLoginCommand(flags, createMockApi(), mockContext(), {
      shell: false,
      openBrowser: false,
      persist: true,
      sessionStore: store,
    });
    expect(exitCode).toBe(0);
    const loaded = await store.load(host);
    expect(loaded?.credential).toBe(sensitiveCredential);
    expect(loaded?.sessionId).toBe("sess_cli_persist");

    clearMemorySession();
    await expect(requireSessionCredential(host, store)).resolves.toBe(sensitiveCredential);

    await runLogoutCommand(flags, createMockApi(), mockContext(), {
      sessionStore: store,
    });
    await expect(requireSessionCredential(host, store)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.required,
    } satisfies Partial<CliError>);
  });

  it("login --no-persist leaves no record on disk", async () => {
    await runLoginCommand(flags, createMockApi(), mockContext(), {
      shell: false,
      openBrowser: false,
      persist: false,
      sessionStore: store,
    });
    await expect(readFile(sessionFilePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
