import { describe, expect, it, vi } from "vitest";
import { runConsoleUnavailableRetry } from "./unavailable-retry.js";

describe("runConsoleUnavailableRetry", () => {
  it("clears the error boundary and invalidates the route match", () => {
    const order: string[] = [];
    const reset = vi.fn(() => {
      order.push("reset");
    });
    const invalidate = vi.fn(() => {
      order.push("invalidate");
    });

    runConsoleUnavailableRetry(reset, invalidate);

    expect(reset).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledOnce();
    expect(order).toEqual(["reset", "invalidate"]);
  });
});
