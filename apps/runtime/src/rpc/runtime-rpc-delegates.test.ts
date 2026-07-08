import { userId } from "@insecur/domain";
import { getBootstrapStatus } from "@insecur/instance-bootstrap";
import { resolveAdmittedUserId } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { consumeGrantAllOperation } from "../operations/consume-grant-all-operation.js";
import { consumeGrantOperation } from "../operations/consume-grant-operation.js";
import { writeSecretOperation } from "../operations/write-secret-operation.js";
import { createRuntimeInjectionPolicyOperation } from "../operations/create-runtime-injection-policy-operation.js";
import { recordAbuseDeniedOperation } from "../operations/record-abuse-denied-operation.js";
import { recordAdmissionDeniedOperation } from "../operations/record-admission-denied-operation.js";
import type { PostAuthRpcRunner } from "./post-auth-rpc-runner.js";
import {
  consumeGrantAllRpc,
  consumeGrantRpc,
  writeSecretRpc,
} from "./runtime-keyring-rpc-delegates.js";
import {
  getBootstrapStatusRpc,
  recordAbuseDeniedRpc,
  recordAdmissionDeniedRpc,
  resolveAdmissionRpc,
} from "./runtime-pre-auth-rpc-delegates.js";
import {
  createRuntimeInjectionPolicyRpc,
  disableRuntimeInjectionPolicyRpc,
  getRuntimeInjectionPolicyRpc,
} from "./runtime-run-policies-rpc-delegates.js";
import { RuntimeServiceDelegatedPostAuthRpc } from "./runtime-service-delegated-post-auth-rpc.js";

vi.mock("../operations/consume-grant-operation.js", () => ({
  consumeGrantOperation: vi.fn(),
}));
vi.mock("../operations/consume-grant-all-operation.js", () => ({
  consumeGrantAllOperation: vi.fn(),
}));
vi.mock("../operations/write-secret-operation.js", () => ({
  writeSecretOperation: vi.fn(),
}));
vi.mock("../operations/record-admission-denied-operation.js", () => ({
  recordAdmissionDeniedOperation: vi.fn(),
}));
vi.mock("../operations/record-abuse-denied-operation.js", () => ({
  recordAbuseDeniedOperation: vi.fn(),
}));
vi.mock("../operations/create-runtime-injection-policy-operation.js", () => ({
  createRuntimeInjectionPolicyOperation: vi.fn(),
}));
vi.mock("../operations/get-runtime-injection-policy-operation.js", () => ({
  getRuntimeInjectionPolicyOperation: vi.fn(),
}));
vi.mock("../operations/disable-runtime-injection-policy-operation.js", () => ({
  disableRuntimeInjectionPolicyOperation: vi.fn(),
}));
vi.mock("@insecur/instance-bootstrap", () => ({
  getBootstrapStatus: vi.fn(),
}));
vi.mock("@insecur/tenant-store", () => ({
  resolveAdmittedUserId: vi.fn(),
}));
vi.mock("./runtime-metadata-rpc-delegates.js", () => ({
  listProjectsRpc: vi.fn(async () => ({ projects: [] })),
  createProjectRpc: vi.fn(async () => ({ projectId: "prj_test" })),
  listEnvironmentsRpc: vi.fn(async () => ({ environments: [] })),
  createEnvironmentRpc: vi.fn(async () => ({ environmentId: "env_test" })),
  listProjectSecretsRpc: vi.fn(async () => ({ environments: [], rows: [] })),
  listSessionOrganizationsRpc: vi.fn(async () => ({ organizations: [] })),
  listOrganizationMembersRpc: vi.fn(async () => ({ members: [] })),
  listOrganizationInvitationsRpc: vi.fn(async () => ({ invitations: [] })),
  listAuditEventsRpc: vi.fn(async () => ({ events: [], nextCursor: null })),
}));
vi.mock("./runtime-high-assurance-rpc-delegates.js", () => ({
  listPendingHighAssuranceChallengesRpc: vi.fn(async () => ({ challenges: [] })),
  getHighAssuranceChallengeRpc: vi.fn(async () => ({ challenge: null })),
  clearHighAssuranceChallengeRpc: vi.fn(async () => ({ cleared: true })),
  denyHighAssuranceChallengeRpc: vi.fn(async () => ({ denied: true })),
}));

const env = { INSTANCE_ROOT_KEY_V1: "test-key" } as never;
const actorUserId = userId.generate();
const post = vi.fn(async (_actorToken, run) => ({
  ok: true as const,
  value: await run({
    actor: {
      type: "user" as const,
      userId: actorUserId,
      workosUserId: "user_test",
      sessionId: "sess",
    },
    auditActor: { type: "user" as const, userId: actorUserId },
    accessActor: { type: "user" as const, userId: actorUserId },
  }),
})) as PostAuthRpcRunner;
const pre = vi.fn(async (run) => ({
  ok: true as const,
  value: await run(),
})) as <T>(run: () => Promise<T>) => Promise<{ ok: true; value: T }>;

describe("runtime rpc delegate seams", () => {
  beforeEach(() => {
    vi.mocked(post).mockClear();
    vi.mocked(pre).mockClear();
    vi.mocked(consumeGrantOperation).mockResolvedValue({ delivery: "ok" } as never);
    vi.mocked(consumeGrantAllOperation).mockResolvedValue({ deliveries: [] } as never);
    vi.mocked(writeSecretOperation).mockResolvedValue({ secretId: "sec_test" } as never);
    vi.mocked(recordAdmissionDeniedOperation).mockResolvedValue({ recorded: true } as never);
    vi.mocked(recordAbuseDeniedOperation).mockResolvedValue({ recorded: true } as never);
    vi.mocked(getBootstrapStatus).mockResolvedValue({ status: "ready" } as never);
    vi.mocked(resolveAdmittedUserId).mockResolvedValue(actorUserId);
    vi.mocked(createRuntimeInjectionPolicyOperation).mockResolvedValue({
      policyId: "rp_test",
    } as never);
  });

  it("forwards keyring rpc methods through post-auth runner", async () => {
    await consumeGrantRpc(post, env, { actorToken: "token" } as never);
    await consumeGrantAllRpc(post, env, { actorToken: "token" } as never);
    await writeSecretRpc(post, env, { actorToken: "token" } as never);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("forwards pre-auth rpc methods", async () => {
    await resolveAdmissionRpc(pre, {
      instanceId: "inst_LOCAL_DEV",
      workosUserId: "user_test",
    } as never);
    await recordAdmissionDeniedRpc(pre, { reasonCode: "auth.denied" } as never);
    await recordAbuseDeniedRpc(pre, { reasonCode: "auth.abuse" } as never);
    await getBootstrapStatusRpc(pre, { instanceId: "inst_LOCAL_DEV" } as never);
    expect(pre).toHaveBeenCalledTimes(4);
  });

  it("forwards run-policy rpc methods", async () => {
    await createRuntimeInjectionPolicyRpc(post, { actorToken: "token" } as never);
    await getRuntimeInjectionPolicyRpc(post, { actorToken: "token" } as never);
    await disableRuntimeInjectionPolicyRpc(post, { actorToken: "token" } as never);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it("exposes delegated post-auth rpc methods on the runtime service map", async () => {
    const host = { postAuthRpc: () => post, env };

    await RuntimeServiceDelegatedPostAuthRpc.listProjects.call(host, {
      actorToken: "token",
    } as never);
    await RuntimeServiceDelegatedPostAuthRpc.createRuntimeInjectionPolicy.call(host, {
      actorToken: "token",
    } as never);
    await RuntimeServiceDelegatedPostAuthRpc.disableRuntimeInjectionPolicy.call(host, {
      actorToken: "token",
    } as never);

    expect(vi.mocked(post)).toHaveBeenCalled();
  });
});
