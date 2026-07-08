import { operationId } from "@insecur/domain";
import { HighAssuranceHandoffError } from "@insecur/high-assurance";
import { describe, expect, it, vi } from "vitest";

import { onAppConnectionChangeGateFailure } from "../src/on-app-connection-change-gate-failure.js";

const OP = operationId.brand("op_01JZ8CFOP2R7M4T0V9X3C5D8F1");

describe("onAppConnectionChangeGateFailure", () => {
  it("records denied audit for non-handoff errors", async () => {
    const recordDenied = vi.fn(async () => undefined);
    const error = new Error("evidence missing");

    await expect(onAppConnectionChangeGateFailure(error, recordDenied)).rejects.toBe(error);
    expect(recordDenied).toHaveBeenCalledOnce();
  });

  it("skips denied audit for high-assurance handoff errors", async () => {
    const recordDenied = vi.fn(async () => undefined);
    const error = new HighAssuranceHandoffError(OP);

    await expect(onAppConnectionChangeGateFailure(error, recordDenied)).rejects.toBe(error);
    expect(recordDenied).not.toHaveBeenCalled();
  });
});
