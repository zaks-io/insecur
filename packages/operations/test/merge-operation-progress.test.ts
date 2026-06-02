import { projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { mergeOperationProgress } from "../src/merge-operation-progress.js";

describe("mergeOperationProgress", () => {
  it("clears syncTargetLease when the patch sets it to null", () => {
    const merged = mergeOperationProgress(
      {
        syncTargetLease: {
          projectId: projectId.brand("prj_00000000000000000000000001"),
          providerKind: "github-actions",
          targetIdentity: "acme/widget",
          fencingToken: 2,
        },
      },
      { syncTargetLease: null },
    );
    expect(merged).not.toHaveProperty("syncTargetLease");
  });
});
