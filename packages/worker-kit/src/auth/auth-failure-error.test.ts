import { authFailureForReason } from "@insecur/auth";
import { requestId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { AuthFailureError } from "./auth-failure-error.js";

describe("AuthFailureError", () => {
  it("carries the auth-boundary request id for HTTP error mapping", () => {
    const reqId = requestId.brand("req_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
    const failure = authFailureForReason("missing");
    const error = new AuthFailureError(failure, reqId);

    expect(error.failure).toBe(failure);
    expect(error.requestId).toBe(reqId);
    expect(error.name).toBe("AuthFailureError");
  });
});
