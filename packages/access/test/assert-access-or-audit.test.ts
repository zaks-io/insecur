import { AUTH_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import {
  auditAccessDenialOnFailure,
  runWithAccessDenialAudit,
} from "../src/assert-access-or-audit.js";

class AccessDeniedError extends Error {
  readonly code = AUTH_ERROR_CODES.insufficientScope;
}

class OtherDeniedError extends Error {
  readonly code = "onboarding.membership_already_exists";
}

describe("auditAccessDenialOnFailure", () => {
  it("records denial without replacing the original access error", async () => {
    const recordDenied = vi.fn().mockResolvedValue(undefined);
    const accessError = new AccessDeniedError("scope required");

    await auditAccessDenialOnFailure(accessError, {
      isAccessDenied: (error): error is AccessDeniedError => error instanceof AccessDeniedError,
      recordDenied,
    });

    expect(recordDenied).toHaveBeenCalledOnce();
    let rethrown: unknown;
    try {
      throw accessError;
    } catch (error) {
      await auditAccessDenialOnFailure(error, {
        isAccessDenied: (e): e is AccessDeniedError => e instanceof AccessDeniedError,
        recordDenied,
      });
      rethrown = error;
    }
    expect(rethrown).toBe(accessError);
  });

  it("still propagates the original access error when the audit write throws", async () => {
    const accessError = new AccessDeniedError("scope required");
    const auditError = new Error("audit writer unavailable");

    await auditAccessDenialOnFailure(accessError, {
      isAccessDenied: (error): error is AccessDeniedError => error instanceof AccessDeniedError,
      recordDenied: () => Promise.reject(auditError),
    });

    await expect(
      (async () => {
        await auditAccessDenialOnFailure(accessError, {
          isAccessDenied: (error): error is AccessDeniedError => error instanceof AccessDeniedError,
          recordDenied: () => Promise.reject(auditError),
        });
        throw accessError;
      })(),
    ).rejects.toBe(accessError);
  });

  it("does not record a denial for non-access failures", async () => {
    const recordDenied = vi.fn().mockResolvedValue(undefined);
    const businessError = new OtherDeniedError("membership exists");

    await auditAccessDenialOnFailure(businessError, {
      isAccessDenied: (error): error is AccessDeniedError => error instanceof AccessDeniedError,
      recordDenied,
    });

    expect(recordDenied).not.toHaveBeenCalled();
  });
});

describe("runWithAccessDenialAudit", () => {
  it("returns the result on success without recording denial", async () => {
    const recordDenied = vi.fn().mockResolvedValue(undefined);

    const result = await runWithAccessDenialAudit(async () => ({ ok: true as const }), {
      isAccessDenied: (error): error is AccessDeniedError => error instanceof AccessDeniedError,
      recordDenied,
    });

    expect(result).toEqual({ ok: true });
    expect(recordDenied).not.toHaveBeenCalled();
  });

  it("records denial and rethrows the original access error", async () => {
    const accessError = new AccessDeniedError("scope required");
    const recordDenied = vi.fn().mockResolvedValue(undefined);

    await expect(
      runWithAccessDenialAudit(
        async () => {
          throw accessError;
        },
        {
          isAccessDenied: (error): error is AccessDeniedError => error instanceof AccessDeniedError,
          recordDenied,
        },
      ),
    ).rejects.toBe(accessError);

    expect(recordDenied).toHaveBeenCalledOnce();
  });

  it("rethrows the original access error when the audit write throws", async () => {
    const accessError = new AccessDeniedError("scope required");

    await expect(
      runWithAccessDenialAudit(
        async () => {
          throw accessError;
        },
        {
          isAccessDenied: (error): error is AccessDeniedError => error instanceof AccessDeniedError,
          recordDenied: () => Promise.reject(new Error("audit failed")),
        },
      ),
    ).rejects.toBe(accessError);
  });
});
