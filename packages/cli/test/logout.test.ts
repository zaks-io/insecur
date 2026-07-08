import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES, successEnvelope } from "@insecur/domain";
import { runInitCommand } from "../src/commands/init.js";
import { runLogoutCommand } from "../src/commands/logout.js";
import type { ApiClient } from "../src/api/types.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { CliError } from "../src/output/cli-error.js";
import { EXIT_AUTH_REQUIRED, EXIT_UNEXPECTED } from "../src/output/exit-codes.js";
import { clearMemorySession, setMemorySession } from "../src/session/memory-session.js";
import { createSessionStore } from "../src/session/persisted-session.js";
import { createFakeKeyStore, generateMachineRootKeyHex } from "@insecur/local-store";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { SESSION_FILE_NAME } from "../src/session/persisted-session.js";

const host = "https://insecur.test";
const sensitiveCredential = "insecur-session-credential-logout-test";

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

function createMockApi(revokeImpl?: ApiClient["revokeCliSession"]): ApiClient {
  return {
    createCliAuthorizationUrl: () => "https://insecur.test/v1/auth/cli/authorize",
    exchangeCliPkceSession: async () => {
      throw new Error("not used");
    },
    provisionPersonalOrganization: async () => {
      throw new Error("not used");
    },
    writeSecretByVariableKey: async () => {
      throw new Error("not used");
    },
    issueInjectionGrant: async () => {
      throw new Error("not used");
    },
    consumeInjectionGrant: async () => {
      throw new Error("not used");
    },
    consumeInjectionGrantAll: async () => {
      throw new Error("not used");
    },
    recordInjectionRunCompleted: async () => {
      throw new Error("not used");
    },
    revokeCliSession:
      revokeImpl ??
      (async () => ({
        ok: true,
        envelope: successEnvelope({ revoked: true }),
      })),
  };
}

describe("logout command", () => {
  afterEach(() => {
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
  });

  it("is a clean no-op without an active session", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "insecur-cli-logout-"));
    const store = createSessionStore({
      keyStore: createFakeKeyStore({ keyHex: generateMachineRootKeyHex() }),
      sessionFilePath: path.join(dir, SESSION_FILE_NAME),
    });
    const revoke = vi.fn();
    const exitCode = await runLogoutCommand(flags, createMockApi(revoke), mockContext(), {
      sessionStore: store,
    });
    expect(exitCode).toBe(0);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("revokes the server session and clears local memory", async () => {
    setMemorySession({
      credential: sensitiveCredential,
      sessionId: "sess_logout",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const revoke = vi.fn(async () => ({
      ok: true as const,
      envelope: successEnvelope({ revoked: true }),
    }));
    const exitCode = await runLogoutCommand(flags, createMockApi(revoke), mockContext());
    expect(exitCode).toBe(0);
    expect(revoke).toHaveBeenCalledWith({
      host,
      bearerCredential: sensitiveCredential,
    });
    await expect(
      runInitCommand(flags, createMockApi(), mockContext(), { profileSlug: "local-dev" }),
    ).rejects.toMatchObject({
      exitCode: EXIT_AUTH_REQUIRED,
      code: AUTH_ERROR_CODES.required,
    } satisfies Partial<CliError>);
  });

  it("treats an already inactive server session as a successful local logout", async () => {
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    setMemorySession({
      credential: sensitiveCredential,
      sessionId: "sess_logout",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const revoke = vi.fn(async () => ({
      ok: true as const,
      envelope: successEnvelope({ revoked: false }),
    }));
    const exitCode = await runLogoutCommand(flags, createMockApi(revoke), mockContext());
    expect(exitCode).toBe(0);
    expect(revoke).toHaveBeenCalledOnce();
    const output = stdoutChunks.join("");
    expect(output).toContain('"revoked":false');
    expect(output).not.toMatch(/server session revoked/i);
    await expect(
      runInitCommand(flags, createMockApi(), mockContext(), { profileSlug: "local-dev" }),
    ).rejects.toMatchObject({
      exitCode: EXIT_AUTH_REQUIRED,
      code: AUTH_ERROR_CODES.required,
    } satisfies Partial<CliError>);
    stdoutSpy.mockRestore();
  });

  it("clears local state when revoke fails with a network error", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "insecur-cli-logout-"));
    const store = createSessionStore({
      keyStore: createFakeKeyStore({ keyHex: generateMachineRootKeyHex() }),
      sessionFilePath: path.join(dir, SESSION_FILE_NAME),
    });
    await store.save({
      credential: sensitiveCredential,
      sessionId: "sess_logout",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      host,
    });
    const revoke = vi.fn(async () => {
      throw new Error("network unreachable");
    });
    const exitCode = await runLogoutCommand(flags, createMockApi(revoke), mockContext(), {
      sessionStore: store,
    });
    expect(exitCode).toBe(EXIT_UNEXPECTED);
    expect(revoke).toHaveBeenCalledOnce();
    expect(await store.load(host)).toBeUndefined();
    await expect(
      runInitCommand(flags, createMockApi(), mockContext(), { profileSlug: "local-dev" }),
    ).rejects.toMatchObject({
      exitCode: EXIT_AUTH_REQUIRED,
      code: AUTH_ERROR_CODES.required,
    } satisfies Partial<CliError>);
  });

  it("never prints session credentials in json output", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const stdoutChunks: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    setMemorySession({
      credential: sensitiveCredential,
      sessionId: "sess_logout",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await runLogoutCommand({ ...flags, json: true }, createMockApi(), mockContext());
    const output = stdoutChunks.join("");
    expect(output).not.toContain(sensitiveCredential);
    expect(stderrSpy.mock.calls.join("")).not.toContain(sensitiveCredential);
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });
});
