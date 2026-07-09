import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { successEnvelope } from "@insecur/domain";
import { createFakeKeyStore, generateMachineRootKeyHex } from "@insecur/local-store";
import { runLoginCommand } from "../src/commands/login.js";
import type { ApiClient } from "../src/api/types.js";
import type { CliDeviceTokenPollResult } from "../src/api/auth-api-types.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { clearMemorySession, getMemorySession } from "../src/session/memory-session.js";
import {
  createSessionStore,
  SESSION_FILE_NAME,
  type SessionStore,
} from "../src/session/persisted-session.js";

const host = "https://insecur.test";
const sensitiveCredential = "insecur-device-credential-test-value";

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

beforeEach(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "insecur-cli-device-"));
  sessionFilePath = path.join(dir, SESSION_FILE_NAME);
  store = createSessionStore({ keyStore, sessionFilePath });
});

afterEach(() => {
  clearMemorySession();
  vi.restoreAllMocks();
});

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

const authenticatedPoll: CliDeviceTokenPollResult = {
  ok: true,
  status: "authenticated",
  credential: sensitiveCredential,
  envelope: successEnvelope({
    sessionId: "sess_device_login",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }),
};

function createDeviceApi(): ApiClient {
  return {
    startCliDeviceAuthorization: async () => ({
      ok: true as const,
      envelope: successEnvelope({
        deviceCode: "device_code_abc",
        userCode: "WDJB-MJHT",
        verificationUri: "https://workos.test/device",
        expiresInSeconds: 300,
        intervalSeconds: 5,
      }),
    }),
    pollCliDeviceToken: async () => authenticatedPoll,
    exchangeCliPkceSession: async () => {
      throw new Error("PKCE exchange must not run on the device path");
    },
    createCliAuthorizationUrl: () => {
      throw new Error("PKCE authorize must not run on the device path");
    },
  } as unknown as ApiClient;
}

describe("runLoginCommand --device", () => {
  it("establishes a memory session via the device flow without PKCE", async () => {
    const exitCode = await runLoginCommand(flags, createDeviceApi(), mockContext(), {
      shell: false,
      openBrowser: false,
      persist: false,
      device: true,
      agentSession: false,
      deviceLoginOverrides: { sleep: () => Promise.resolve() },
    });
    expect(exitCode).toBe(0);
    expect(getMemorySession()?.credential).toBe(sensitiveCredential);
  });

  it("persists the device session sealed, never as plaintext on disk", async () => {
    await runLoginCommand(flags, createDeviceApi(), mockContext(), {
      shell: false,
      openBrowser: false,
      persist: true,
      device: true,
      agentSession: false,
      sessionStore: store,
      deviceLoginOverrides: { sleep: () => Promise.resolve() },
    });
    const contents = await readFile(sessionFilePath, "utf8");
    expect(contents).not.toContain(sensitiveCredential);
    expect(contents).not.toContain("sess_device_login");
    await expect(store.load(host)).resolves.toMatchObject({ credential: sensitiveCredential });
  });

  it("writes nothing to disk with --device --no-persist", async () => {
    await runLoginCommand(flags, createDeviceApi(), mockContext(), {
      shell: false,
      openBrowser: false,
      persist: false,
      device: true,
      agentSession: false,
      sessionStore: store,
      deviceLoginOverrides: { sleep: () => Promise.resolve() },
    });
    await expect(readFile(sessionFilePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the credential out of stdout JSON output on the device path", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runLoginCommand({ ...flags, quiet: false }, createDeviceApi(), mockContext(), {
      shell: false,
      openBrowser: false,
      persist: false,
      device: true,
      agentSession: false,
      deviceLoginOverrides: { sleep: () => Promise.resolve() },
    });
    const written = stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(written).not.toContain(sensitiveCredential);
  });
});
