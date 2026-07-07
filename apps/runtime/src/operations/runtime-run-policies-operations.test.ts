import { AUTH_ERROR_CODES } from "@insecur/domain";
import {
  environmentId,
  machineIdentityId,
  organizationId,
  parseDisplayName,
  projectId,
  requestId,
  runtimePolicyId,
  runtimePolicyVersionId,
  secretId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import {
  createRuntimeInjectionPolicyCommand,
  disableRuntimeInjectionPolicyCommand,
  getRuntimeInjectionPolicyShow,
} from "@insecur/runtime-injection";
import { withTenantScope } from "@insecur/tenant-store";
import type {
  CreateRuntimeInjectionPolicyRpcInput,
  DisableRuntimeInjectionPolicyRpcInput,
  GetRuntimeInjectionPolicyRpcInput,
} from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRuntimeInjectionPolicyOperation } from "./create-runtime-injection-policy-operation.js";
import { disableRuntimeInjectionPolicyOperation } from "./disable-runtime-injection-policy-operation.js";
import { getRuntimeInjectionPolicyOperation } from "./get-runtime-injection-policy-operation.js";

vi.mock("@insecur/runtime-injection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/runtime-injection")>();
  return {
    ...actual,
    createRuntimeInjectionPolicyCommand: vi.fn(),
    getRuntimeInjectionPolicyShow: vi.fn(),
    disableRuntimeInjectionPolicyCommand: vi.fn(),
  };
});

vi.mock("./metadata-operation-shared.js", () => ({
  assertUserOrganizationMembership: vi.fn(),
}));

const { getPolicyById } = vi.hoisted(() => ({
  getPolicyById: vi.fn(),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
    TenantRuntimeInjectionPolicyStore: vi.fn(function MockTenantRuntimeInjectionPolicyStore() {
      return { getPolicyById };
    }),
  };
});

const organization = organizationId.brand("org_00000000000000000000000001");
const project = projectId.brand("prj_00000000000000000000000001");
const environment = environmentId.brand("env_00000000000000000000000001");
const policy = runtimePolicyId.brand("rp_00000000000000000000000001");
const policyVersion = runtimePolicyVersionId.brand("rpv_00000000000000000000000001");
const boundSecret = secretId.brand("sec_00000000000000000000000001");
const request = requestId.generate();
const actorUserId = userId.generate();
const accessActor = { type: "user" as const, userId: actorUserId };
const machineIdentity = machineIdentityId.brand("mach_00000000000000000000000001");
const machineActor = {
  type: "machine" as const,
  machineIdentityId: machineIdentity,
  tokenScope: { organizationId: organization, projectId: project },
  credentialScopes: [] as const,
};

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

const activeVersion = {
  policyVersionId: policyVersion,
  versionNumber: 1,
  displayNameSnapshot: testDisplayName("dev-web"),
  secretIds: [boundSecret],
  variableKeys: [] as const,
  command: "npm run deploy",
  commandFingerprint: "sha256:abc",
  ttlSeconds: 300,
  deliveryMode: "environment_variables",
  createdAt: "2026-06-24T00:00:00.000Z",
};

describe("runtime injection policy operations", () => {
  beforeEach(() => {
    vi.mocked(withTenantScope).mockReset();
    vi.mocked(createRuntimeInjectionPolicyCommand).mockReset();
    vi.mocked(getRuntimeInjectionPolicyShow).mockReset();
    vi.mocked(disableRuntimeInjectionPolicyCommand).mockReset();
    getPolicyById.mockReset();
    vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) =>
      fn({ db: {}, sql: {} } as never),
    );
  });

  it("createRuntimeInjectionPolicyOperation forwards to the command layer", async () => {
    vi.mocked(createRuntimeInjectionPolicyCommand).mockResolvedValue({
      policyId: policy,
      policyVersionId: policyVersion,
      displayName: testDisplayName("dev-web"),
      activeVersion,
      auditEventId: "aud_00000000000000000000000001",
    });

    const input: CreateRuntimeInjectionPolicyRpcInput = {
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      policyId: policy,
      displayName: testDisplayName("dev-web"),
      command: "npm run deploy",
      secretIds: [boundSecret],
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(
      createRuntimeInjectionPolicyOperation({
        input,
        auditActor: accessActor,
        accessActor,
      }),
    ).resolves.toMatchObject({
      policyId: policy,
      policyVersionId: policyVersion,
      auditEventId: "aud_00000000000000000000000001",
    });
  });

  it("getRuntimeInjectionPolicyOperation returns metadata-only show payload", async () => {
    vi.mocked(getRuntimeInjectionPolicyShow).mockResolvedValue({
      policyId: policy,
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      displayName: testDisplayName("dev-web"),
      disabledAt: null,
      createdAt: "2026-06-24T00:00:00.000Z",
      activeVersion,
    });

    const input: GetRuntimeInjectionPolicyRpcInput = {
      organizationId: organization,
      policyId: policy,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(
      getRuntimeInjectionPolicyOperation({
        input,
        auditActor: accessActor,
        accessActor,
      }),
    ).resolves.toMatchObject({
      policyId: policy,
      activeVersion: { secretIds: [boundSecret] },
    });
  });

  it("disableRuntimeInjectionPolicyOperation validates coordinates before disable", async () => {
    getPolicyById.mockResolvedValue({
      policyId: policy,
      organizationId: organization,
      projectId: project,
      environmentId: environment,
    });
    vi.mocked(disableRuntimeInjectionPolicyCommand).mockResolvedValue({
      policyId: policy,
      disabledAt: "2026-06-24T01:00:00.000Z",
      auditEventId: "aud_00000000000000000000000002",
    });

    const input: DisableRuntimeInjectionPolicyRpcInput = {
      organizationId: organization,
      projectId: project,
      environmentId: environment,
      policyId: policy,
      comment: "Rotate deployment flow",
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(
      disableRuntimeInjectionPolicyOperation({
        input,
        auditActor: accessActor,
        accessActor,
      }),
    ).resolves.toMatchObject({
      auditEventId: "aud_00000000000000000000000002",
    });
  });

  it("rejects non-user actors", async () => {
    const input: GetRuntimeInjectionPolicyRpcInput = {
      organizationId: organization,
      policyId: policy,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(
      getRuntimeInjectionPolicyOperation({
        input,
        auditActor: { type: "machine", machineIdentityId: machineIdentity },
        accessActor: machineActor,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });
});
