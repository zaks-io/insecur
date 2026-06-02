import { organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { OperationStoreError } from "../src/operation-errors.js";
import { validateSyncTargetKey } from "../src/sync-target-types.js";

describe("sync target key validation", () => {
  it("accepts metadata-only opaque target identities", () => {
    expect(() => {
      validateSyncTargetKey({
        organizationId: organizationId.brand("org_00000000000000000000000001"),
        projectId: projectId.brand("prj_00000000000000000000000001"),
        providerKind: "cloudflare-worker-secret",
        targetIdentity: "acct/worker-script/production",
      });
    }).not.toThrow();
  });

  it("rejects unsupported provider kinds and invalid target identities", () => {
    expect(() => {
      validateSyncTargetKey({
        organizationId: organizationId.brand("org_00000000000000000000000001"),
        projectId: projectId.brand("prj_00000000000000000000000001"),
        providerKind: "unknown-provider",
        targetIdentity: "repo/a",
      });
    }).toThrow(OperationStoreError);

    expect(() => {
      validateSyncTargetKey({
        organizationId: organizationId.brand("org_00000000000000000000000001"),
        projectId: projectId.brand("prj_00000000000000000000000001"),
        providerKind: "github-actions",
        targetIdentity: "has spaces",
      });
    }).toThrow(OperationStoreError);
  });
});
