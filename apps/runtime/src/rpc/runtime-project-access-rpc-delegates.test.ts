import { organizationId, projectId, requestId, userId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import {
  listProjectInjectionGrantsRpc,
  listProjectMachineIdentitiesRpc,
} from "./runtime-project-access-rpc-delegates.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");

vi.mock("../operations/list-project-machine-identities-operation.js", () => ({
  listProjectMachineIdentitiesOperation: vi.fn(async () => ({ machineIdentities: [] })),
}));

vi.mock("../operations/list-project-injection-grants-operation.js", () => ({
  listProjectInjectionGrantsOperation: vi.fn(async () => ({ grants: [] })),
}));

describe("runtime project access rpc delegates", () => {
  it("forwards machine identity reads through the post-auth runner", async () => {
    const post = vi.fn(async (_token, run) => ({
      ok: true as const,
      value: await run({
        auditActor: { type: "user", userId: USER },
        accessActor: { type: "user", userId: USER },
        actor: { type: "user", userId: USER },
      }),
    }));

    await expect(
      listProjectMachineIdentitiesRpc(post, {
        actorToken: "token",
        requestId: REQ,
        organizationId: ORG,
        projectId: PROJECT,
      }),
    ).resolves.toMatchObject({ ok: true, value: { machineIdentities: [] } });
  });

  it("forwards injection grant reads through the post-auth runner", async () => {
    const post = vi.fn(async (_token, run) => ({
      ok: true as const,
      value: await run({
        auditActor: { type: "user", userId: USER },
        accessActor: { type: "user", userId: USER },
        actor: { type: "user", userId: USER },
      }),
    }));

    await expect(
      listProjectInjectionGrantsRpc(post, {
        actorToken: "token",
        requestId: REQ,
        organizationId: ORG,
        projectId: PROJECT,
      }),
    ).resolves.toMatchObject({ ok: true, value: { grants: [] } });
  });
});
