import {
  AUTH_ERROR_CODES,
  RUNTIME_POLICY_ERROR_CODES,
  organizationId,
  projectId,
  runtimePolicyId,
  secretId,
} from "@insecur/domain";
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../src/api/types.js";
import { runRunPoliciesCreateCommand } from "../src/commands/run-policies-create.js";
import { runRunPoliciesDisableCommand } from "../src/commands/run-policies-disable.js";
import { runRunPoliciesShowCommand } from "../src/commands/run-policies-show.js";
import type { ResolvedCliContext } from "../src/config/load-cli-context.js";
import { EXIT_CONFLICT, EXIT_STEP_UP } from "../src/output/exit-codes.js";
import { attachGlobalOptions, globalFlags } from "../src/program-deps.js";
import { registerRunPoliciesCommands } from "../src/register-run-policies-commands.js";

const ORG_ID = organizationId.brand("org_00000000000000000000000001");
const PROJECT_ID = projectId.brand("prj_00000000000000000000000001");
const POLICY_ID = runtimePolicyId.brand("rp_00000000000000000000000001");
const SECRET_ID = secretId.brand("sec_00000000000000000000000001");

const context: ResolvedCliContext = {
  scope: {
    host: "https://insecur.test",
    orgId: ORG_ID,
    projectId: PROJECT_ID,
    envId: undefined,
    profileSlug: undefined,
    profileId: undefined,
    configDir: "/tmp",
  },
  configPath: "/tmp/.insecur.json",
};

function createMockApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    createRuntimeInjectionPolicy: vi.fn(),
    getRuntimeInjectionPolicy: vi.fn(),
    disableRuntimeInjectionPolicy: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

vi.mock("../src/auth/require-session.js", () => ({
  requireSessionCredential: vi.fn(async () => "test-credential"),
}));

vi.mock("../src/input/read-display-name-stdin.js", () => ({
  readDisplayNameFromStdin: vi.fn(async () => "dev-web"),
}));

describe("run-policies CLI commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it("create fails with validation error on duplicate display name instead of suffixing", async () => {
    const api = createMockApi({
      createRuntimeInjectionPolicy: vi.fn(async () => ({
        ok: false as const,
        httpStatus: 409,
        envelope: {
          ok: false as const,
          error: {
            code: RUNTIME_POLICY_ERROR_CODES.displayNameInUse,
            message: "display name already in use in environment",
            retryable: false,
          },
        },
      })),
    });

    await expect(
      runRunPoliciesCreateCommand({ json: false, quiet: false, verbose: false }, api, context, {
        policyId: POLICY_ID,
        envId: "env_00000000000000000000000001",
        displayNameStdin: true,
        command: "npm run deploy",
        commandFingerprint: undefined,
        secretIds: SECRET_ID,
        operationId: undefined,
      }),
    ).rejects.toMatchObject({ code: RUNTIME_POLICY_ERROR_CODES.displayNameInUse });
  });

  it("create returns step-up exit code when high-assurance challenge is required", async () => {
    const api = createMockApi({
      createRuntimeInjectionPolicy: vi.fn(async () => ({
        ok: false as const,
        httpStatus: 403,
        envelope: {
          ok: false as const,
          error: {
            code: AUTH_ERROR_CODES.highAssuranceRequired,
            message: "high-assurance challenge required",
            retryable: false,
          },
          meta: { operationId: "op_00000000000000000000000001" },
        },
      })),
    });

    const exitCode = await runRunPoliciesCreateCommand(
      { json: true, quiet: false, verbose: false },
      api,
      context,
      {
        policyId: POLICY_ID,
        envId: "env_00000000000000000000000001",
        displayNameStdin: true,
        command: "npm run deploy",
        commandFingerprint: undefined,
        secretIds: SECRET_ID,
        operationId: undefined,
      },
    );
    expect(exitCode).toBe(EXIT_STEP_UP);
  });

  it("show --json returns metadata-only policy payload", async () => {
    const api = createMockApi({
      getRuntimeInjectionPolicy: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            policyId: POLICY_ID,
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            environmentId: "env_00000000000000000000000001" as never,
            displayName: "dev-web" as never,
            disabledAt: null,
            createdAt: "2026-06-24T00:00:00.000Z",
            activeVersion: {
              policyVersionId: "rpv_00000000000000000000000001" as never,
              versionNumber: 1,
              displayNameSnapshot: "dev-web" as never,
              secretIds: [SECRET_ID],
              variableKeys: [],
              command: "npm run deploy",
              commandFingerprint: null,
              ttlSeconds: 300,
              deliveryMode: "environment_variables",
              createdAt: "2026-06-24T00:00:00.000Z",
            },
          },
        },
      })),
    });

    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitCode = await runRunPoliciesShowCommand(
      { json: true, quiet: false, verbose: false },
      api,
      context,
      POLICY_ID,
    );
    expect(exitCode).toBe(0);
    const output = stdout.mock.calls.map((call) => String(call[0])).join("");
    expect(output).toContain('"secretIds"');
    expect(output).not.toContain("encodedValueUtf8");
    stdout.mockRestore();
  });

  it("create duplicate name maps to conflict exit code in json mode", async () => {
    const api = createMockApi({
      createRuntimeInjectionPolicy: vi.fn(async () => ({
        ok: false as const,
        httpStatus: 409,
        envelope: {
          ok: false as const,
          error: {
            code: RUNTIME_POLICY_ERROR_CODES.displayNameInUse,
            message: "display name already in use in environment",
            retryable: false,
          },
        },
      })),
    });

    const exitCode = await runRunPoliciesCreateCommand(
      { json: true, quiet: false, verbose: false },
      api,
      context,
      {
        policyId: POLICY_ID,
        envId: "env_00000000000000000000000001",
        displayNameStdin: true,
        command: "npm run deploy",
        commandFingerprint: undefined,
        secretIds: SECRET_ID,
        operationId: undefined,
      },
    );
    expect(exitCode).toBe(EXIT_CONFLICT);
  });

  it("disable returns step-up exit code when high-assurance challenge is required", async () => {
    const api = createMockApi({
      disableRuntimeInjectionPolicy: vi.fn(async () => ({
        ok: false as const,
        httpStatus: 403,
        envelope: {
          ok: false as const,
          error: {
            code: AUTH_ERROR_CODES.highAssuranceRequired,
            message: "high-assurance challenge required",
            retryable: false,
          },
          meta: { operationId: "op_00000000000000000000000001" },
        },
      })),
    });

    const exitCode = await runRunPoliciesDisableCommand(
      { json: true, quiet: false, verbose: false },
      api,
      context,
      {
        policyId: POLICY_ID,
        envId: "env_00000000000000000000000001",
        comment: "retire migration flow",
        operationId: undefined,
      },
    );
    expect(exitCode).toBe(EXIT_STEP_UP);
  });

  it("disable succeeds and returns exit code zero", async () => {
    const api = createMockApi({
      disableRuntimeInjectionPolicy: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            policyId: POLICY_ID,
            disabledAt: "2026-06-24T00:00:00.000Z",
            auditEventId: "aud_00000000000000000000000001",
          },
        },
      })),
    });

    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const exitCode = await runRunPoliciesDisableCommand(
      { json: false, quiet: false, verbose: false },
      api,
      context,
      {
        policyId: POLICY_ID,
        envId: "env_00000000000000000000000001",
        comment: "retire migration flow",
        operationId: "op_00000000000000000000000001",
      },
    );

    expect(exitCode).toBe(0);
    expect(api.disableRuntimeInjectionPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        policyId: POLICY_ID,
        comment: "retire migration flow",
        operationId: "op_00000000000000000000000001",
      }),
    );
    stdout.mockRestore();
  });

  it("registered show command reads globals from the commander action context", async () => {
    const api = createMockApi({
      getRuntimeInjectionPolicy: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            policyId: POLICY_ID,
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            environmentId: "env_00000000000000000000000001" as never,
            displayName: "dev-web" as never,
            disabledAt: null,
            createdAt: "2026-06-24T00:00:00.000Z",
            activeVersion: {
              policyVersionId: "rpv_00000000000000000000000001" as never,
              versionNumber: 1,
              displayNameSnapshot: "dev-web" as never,
              secretIds: [SECRET_ID],
              variableKeys: [],
              command: "npm run deploy",
              commandFingerprint: null,
              ttlSeconds: 300,
              deliveryMode: "environment_variables",
              createdAt: "2026-06-24T00:00:00.000Z",
            },
          },
        },
      })),
    });
    const resolveApi = vi.fn(async () => ({ api, context }));
    const program = attachGlobalOptions(new Command());
    registerRunPoliciesCommands(program, { globalFlags, resolveApi });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "insecur",
      "--host",
      "https://insecur.test",
      "--org-id",
      ORG_ID,
      "--json",
      "--quiet",
      "run-policies",
      "show",
      POLICY_ID,
    ]);

    expect(resolveApi).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "https://insecur.test",
        orgId: ORG_ID,
        json: true,
        quiet: true,
      }),
    );
    expect(api.getRuntimeInjectionPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "https://insecur.test",
        organizationId: ORG_ID,
        policyId: POLICY_ID,
      }),
    );
    expect(process.exitCode).toBe(0);
    stdout.mockRestore();
  });

  it("registered disable command reads options from the commander action context", async () => {
    const api = createMockApi({
      disableRuntimeInjectionPolicy: vi.fn(async () => ({
        ok: true as const,
        envelope: {
          ok: true as const,
          data: {
            policyId: POLICY_ID,
            disabledAt: "2026-06-24T00:00:00.000Z",
            auditEventId: "aud_00000000000000000000000001",
          },
        },
      })),
    });
    const program = attachGlobalOptions(new Command());
    registerRunPoliciesCommands(program, {
      globalFlags,
      resolveApi: async () => ({ api, context }),
    });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await program.parseAsync([
      "node",
      "insecur",
      "--host",
      "https://insecur.test",
      "--org-id",
      ORG_ID,
      "--json",
      "--quiet",
      "run-policies",
      "disable",
      "--env-id",
      "env_00000000000000000000000001",
      "--comment",
      "retire migration flow",
      "--operation-id",
      "op_00000000000000000000000001",
      POLICY_ID,
    ]);

    expect(api.disableRuntimeInjectionPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        policyId: POLICY_ID,
        environmentId: "env_00000000000000000000000001",
        comment: "retire migration flow",
        operationId: "op_00000000000000000000000001",
      }),
    );
    expect(process.exitCode).toBe(0);
    stdout.mockRestore();
  });
});
