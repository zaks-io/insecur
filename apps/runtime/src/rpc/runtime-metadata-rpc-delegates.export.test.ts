import { organizationId, requestId, userId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { exportTenantAuditRpc } from "./runtime-metadata-rpc-delegates.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");

vi.mock("../operations/export-tenant-audit-operation.js", () => ({
  exportTenantAuditOperation: vi.fn(async () => ({
    manifest: { format: "insecur-audit-export-v1" },
    jsonl: "",
  })),
}));

describe("exportTenantAuditRpc", () => {
  it("forwards export through the post-auth runner", async () => {
    const post = vi.fn(async (_token, run) => ({
      ok: true as const,
      value: await run({
        auditActor: { type: "user", userId: USER },
        accessActor: { type: "user", userId: USER },
        actor: { type: "user", userId: USER },
      }),
    }));

    await expect(
      exportTenantAuditRpc(post, {} as never, {
        actorToken: "token",
        requestId: REQ,
        organizationId: ORG,
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-02T00:00:00.000Z",
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(post).toHaveBeenCalledTimes(1);
  });
});
