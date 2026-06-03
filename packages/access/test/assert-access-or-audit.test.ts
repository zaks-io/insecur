import { AUTH_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import {
  isInsufficientScopeAccessDenial,
  recordAccessDenialOnInsufficientScope,
  runWithAccessDenialAudit,
} from "../src/assert-access-or-audit.js";

class TestAccessError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TestAccessError";
    this.code = code;
  }
}

describe("isInsufficientScopeAccessDenial", () => {
  it("matches insufficient_scope errors for the given error class", () => {
    const error = new TestAccessError(AUTH_ERROR_CODES.insufficientScope, "scope required");
    expect(isInsufficientScopeAccessDenial(error, TestAccessError)).toBe(true);
  });

  it("rejects other codes and unrelated errors", () => {
    expect(
      isInsufficientScopeAccessDenial(
        new TestAccessError("secret.input_required", "input required"),
        TestAccessError,
      ),
    ).toBe(false);
    expect(isInsufficientScopeAccessDenial(new Error("nope"), TestAccessError)).toBe(false);
  });
});

describe("recordAccessDenialOnInsufficientScope", () => {
  it("records denial and leaves the original access error for the caller to rethrow", async () => {
    const error = new TestAccessError(AUTH_ERROR_CODES.insufficientScope, "scope required");
    const recordDenial = vi.fn().mockResolvedValue(undefined);

    await recordAccessDenialOnInsufficientScope(error, {
      isAccessDenial: (candidate) => isInsufficientScopeAccessDenial(candidate, TestAccessError),
      recordDenial,
    });

    expect(recordDenial).toHaveBeenCalledOnce();
  });

  it("still allows the original access error to propagate when audit write throws", async () => {
    const error = new TestAccessError(AUTH_ERROR_CODES.insufficientScope, "scope required");
    const recordDenial = vi.fn().mockRejectedValue(new Error("audit writer down"));

    await recordAccessDenialOnInsufficientScope(error, {
      isAccessDenial: (candidate) => isInsufficientScopeAccessDenial(candidate, TestAccessError),
      recordDenial,
    });

    expect(recordDenial).toHaveBeenCalledOnce();
    await expect(
      (async () => {
        await recordAccessDenialOnInsufficientScope(error, {
          isAccessDenial: (candidate) =>
            isInsufficientScopeAccessDenial(candidate, TestAccessError),
          recordDenial,
        });
        throw error;
      })(),
    ).rejects.toBe(error);
  });

  it("does not record when access was not denied", async () => {
    const recordDenial = vi.fn().mockResolvedValue(undefined);

    await recordAccessDenialOnInsufficientScope(
      new TestAccessError("secret.input_required", "input required"),
      {
        isAccessDenial: (candidate) => isInsufficientScopeAccessDenial(candidate, TestAccessError),
        recordDenial,
      },
    );

    expect(recordDenial).not.toHaveBeenCalled();
  });
});

describe("runWithAccessDenialAudit", () => {
  it("returns the success result without recording denial", async () => {
    const recordDenial = vi.fn().mockResolvedValue(undefined);

    const result = await runWithAccessDenialAudit(async () => "ok", {
      isAccessDenial: (candidate) => isInsufficientScopeAccessDenial(candidate, TestAccessError),
      recordDenial,
    });

    expect(result).toBe("ok");
    expect(recordDenial).not.toHaveBeenCalled();
  });

  it("rethrows the original insufficient_scope error after recording denial", async () => {
    const error = new TestAccessError(AUTH_ERROR_CODES.insufficientScope, "scope required");
    const recordDenial = vi.fn().mockResolvedValue(undefined);

    await expect(
      runWithAccessDenialAudit(
        () => {
          throw error;
        },
        {
          isAccessDenial: (candidate) =>
            isInsufficientScopeAccessDenial(candidate, TestAccessError),
          recordDenial,
        },
      ),
    ).rejects.toBe(error);

    expect(recordDenial).toHaveBeenCalledOnce();
  });
});
