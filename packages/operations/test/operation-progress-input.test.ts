import { projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { OperationStoreError } from "../src/operation-errors.js";
import type { OperationProgressInput } from "../src/operation-types.js";
import { validateOperationProgressInput } from "../src/validate-operation-metadata.js";

describe("operation progress input", () => {
  it("rejects caller-supplied syncTargetLease on create/transition/progress patches", () => {
    const injected = {
      syncTargetLease: {
        projectId: projectId.brand("prj_00000000000000000000000001"),
        providerKind: "github-actions",
        targetIdentity: "acme/injected",
        fencingToken: 99,
      },
    } as OperationProgressInput;

    expect(() => validateOperationProgressInput(injected)).toThrow(OperationStoreError);
    expect(() => validateOperationProgressInput(injected)).toThrow(
      /syncTargetLease is owned by sync target lease claim and release APIs/,
    );
  });

  it("accepts metadata-only caller progress without syncTargetLease", () => {
    expect(() => {
      validateOperationProgressInput({
        counters: { bindingsWritten: 1 },
        resultCode: "sync.target_busy",
        cause: "retryable",
      });
    }).not.toThrow();
  });

  it("rejects caller-supplied abandoned progress flags", () => {
    expect(() =>
      validateOperationProgressInput({ abandoned: true } as OperationProgressInput),
    ).toThrow(/abandoned is owned by operation liveness recovery/);
  });
});
