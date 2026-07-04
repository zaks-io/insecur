import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bytesToBase64Url } from "@insecur/domain";
import { PROJECT_CONFIG_FILE, USER_CONFIG_FILE } from "../src/config/paths.js";
import { createIsolatedHome } from "./helpers/isolated-home.js";

const spawnMock = vi.hoisted(() => vi.fn());
const issueInjectionGrantMock = vi.hoisted(() => vi.fn());
const consumeInjectionGrantAllMock = vi.hoisted(() => vi.fn());
const recordInjectionRunCompletedMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("../src/api/http-client.js", () => ({
  createHttpApiClientForHost: () => ({
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
    issueInjectionGrant: issueInjectionGrantMock,
    consumeInjectionGrant: async () => {
      throw new Error("not used");
    },
    consumeInjectionGrantAll: consumeInjectionGrantAllMock,
    recordInjectionRunCompleted: recordInjectionRunCompletedMock,
  }),
}));

import { runCli } from "../src/program.js";
import { clearMemorySession, setMemorySession } from "../src/session/memory-session.js";

const ORG_ID = "org_01TEST00000000000000000001";
const PROJECT_ID = "prj_01TEST00000000000000000001";
const ENV_ID = "env_01TEST00000000000000000001";
const PROFILE_ID = "prof_01TEST00000000000000000001";
const POLICY_ID = "rp_01TEST00000000000000000001";
const GRANT_ID = "igr_01TEST00000000000000000001";
const SENSITIVE_VALUE = "policy-secret-value";
const NON_EXPIRED_SESSION_EXPIRES_AT = "2999-01-01T00:00:00.000Z";

function createMockChild(exitCode: number) {
  const child = new EventEmitter() as EventEmitter & { stdout?: unknown; stderr?: unknown };
  queueMicrotask(() => {
    child.emit("close", exitCode, null);
  });
  return child;
}

describe("runCli project .insecur.json profile binding", () => {
  let isolatedHome: Awaited<ReturnType<typeof createIsolatedHome>> | undefined;
  let projectDir: string | undefined;
  let stdout = "";

  afterEach(() => {
    isolatedHome?.restore();
    isolatedHome = undefined;
    projectDir = undefined;
    clearMemorySession();
    delete process.env.INSECUR_SESSION_TOKEN;
    vi.restoreAllMocks();
    spawnMock.mockReset();
    issueInjectionGrantMock.mockReset();
    consumeInjectionGrantAllMock.mockReset();
    recordInjectionRunCompletedMock.mockReset();
    stdout = "";
  });

  it("runs profile-backed injection from scope.profileId without an explicit profile argument", async () => {
    isolatedHome = await createIsolatedHome("insecur-cli-run-project-profile-home-");
    projectDir = await mkdtemp(path.join(tmpdir(), "insecur-cli-run-project-profile-project-"));
    await writeFile(
      path.join(projectDir, PROJECT_CONFIG_FILE),
      `${JSON.stringify(
        {
          host: "https://insecur.test",
          orgId: ORG_ID,
          projectId: PROJECT_ID,
          defaultEnvId: ENV_ID,
          profileId: PROFILE_ID,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await mkdir(path.join(isolatedHome.homeDir, ".insecur"), { recursive: true });
    await writeFile(
      path.join(isolatedHome.homeDir, ".insecur", USER_CONFIG_FILE),
      `${JSON.stringify(
        {
          profiles: {
            [PROFILE_ID]: {
              slug: "local-dev",
              displayName: "Local development",
              host: "https://insecur.test",
              orgId: ORG_ID,
              projectId: PROJECT_ID,
              envId: ENV_ID,
              defaultRunPolicyId: POLICY_ID,
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    setMemorySession({
      credential: "credential_test",
      sessionId: "sess_test",
      expiresAt: NON_EXPIRED_SESSION_EXPIRES_AT,
    });

    issueInjectionGrantMock.mockResolvedValue({
      ok: true,
      envelope: {
        ok: true,
        data: {
          grantId: GRANT_ID,
          expiresAt: "2026-01-01T00:05:00.000Z",
          auditEventId: "aud_issue",
        },
        meta: { requestId: "req_issue" },
      },
    });
    consumeInjectionGrantAllMock.mockResolvedValue({
      ok: true,
      envelope: {
        ok: true,
        delivery: {
          grantId: GRANT_ID,
          entries: [
            {
              variableKey: "API_KEY",
              secretId: "sec_01TEST00000000000000000001",
              secretVersionId: "sv_01TEST00000000000000000001",
              encodedValueUtf8: bytesToBase64Url(new TextEncoder().encode(SENSITIVE_VALUE)),
            },
          ],
          auditEventId: "aud_consume",
        },
        meta: { requestId: "req_consume" },
      },
    });
    recordInjectionRunCompletedMock.mockResolvedValue({
      ok: true,
      envelope: {
        ok: true,
        data: {
          auditEventId: "aud_run_completed",
          alreadyRecorded: false,
        },
        meta: { requestId: "req_run_completed" },
      },
    });
    spawnMock.mockImplementation(() => createMockChild(0));
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runCli([
      "node",
      "insecur",
      "--config-dir",
      projectDir,
      "run",
      "node",
      "-e",
      "process.exit(0)",
      "--json",
      "--quiet",
    ]);

    expect(exitCode).toBe(0);
    expect(issueInjectionGrantMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: ENV_ID,
        policyId: POLICY_ID,
      }),
    );
    expect(consumeInjectionGrantAllMock).toHaveBeenCalledTimes(1);
    expect(stdout).not.toContain(SENSITIVE_VALUE);
    stdoutSpy.mockRestore();
  });
});
