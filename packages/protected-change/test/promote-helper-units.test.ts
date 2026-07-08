import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  APPROVAL_ERROR_CODES,
  PROTECTED_CHANGE_ERROR_CODES,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { hashCommentMetadata } from "../src/hash-comment-metadata.js";
import { noopHighAssuranceDenied } from "../src/noop-high-assurance-denied.js";
import { parsePromoteDraftSelection } from "../src/parse-promote-draft-selection.js";
import { protectedChangeAuditEventCode } from "../src/protected-change-audit-codes.js";
import { isProtectedChangeError, ProtectedChangeError } from "../src/protected-change-errors.js";
import { validateCreateProtectedChangeInput } from "../src/validate-create-protected-change.js";

describe("parsePromoteDraftSelection", () => {
  it("rejects empty selection", () => {
    expect(() => parsePromoteDraftSelection([])).toThrow(
      expect.objectContaining({ code: VALIDATION_ERROR_CODES.invalidCommandInput }),
    );
  });

  it("rejects wildcard and all-staged tokens", () => {
    for (const token of ["*", "all", "all-staged", "staged", "wildcard", "sv_*"]) {
      expect(() => parsePromoteDraftSelection([token])).toThrow(
        expect.objectContaining({ code: APPROVAL_ERROR_CODES.wildcardSelectionRejected }),
      );
    }
  });

  it("rejects invalid draft version ids", () => {
    expect(() => parsePromoteDraftSelection(["sec_00000000000000000000000001"])).toThrow(
      expect.objectContaining({ code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId }),
    );
  });

  it("accepts explicit draft version ids", () => {
    expect(
      parsePromoteDraftSelection([
        "sv_00000000000000000000000001",
        "sv_00000000000000000000000002",
      ]),
    ).toEqual({
      draftVersionIds: ["sv_00000000000000000000000001", "sv_00000000000000000000000002"],
      secretIds: [],
    });
  });
});

describe("hashCommentMetadata", () => {
  it("returns empty metadata for absent or empty comments", async () => {
    expect(await hashCommentMetadata(undefined)).toEqual({});
    expect(await hashCommentMetadata("")).toEqual({});
  });

  it("returns length and a real sha256 digest for non-empty comments, never the raw text", async () => {
    const metadata = await hashCommentMetadata("ship it");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("ship it"));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(metadata).toEqual({
      commentLength: 7,
      commentSha256: `sha256:${hex}`,
    });
  });
});

describe("protectedChangeAuditEventCode", () => {
  it("maps success actions to production audit codes", () => {
    expect(protectedChangeAuditEventCode({ action: "approved", outcome: "success" })).toBe(
      PRODUCTION_AUDIT_EVENT_CODES.protectedChangeApproved,
    );
  });

  it("maps denied outcomes to transition_denied", () => {
    expect(protectedChangeAuditEventCode({ action: "submitted", outcome: "denied" })).toBe(
      PRODUCTION_AUDIT_EVENT_CODES.protectedChangeTransitionDenied,
    );
  });
});

describe("ProtectedChangeError", () => {
  it("identifies protected change errors", () => {
    const error = new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
      "missing evidence",
    );
    expect(isProtectedChangeError(error)).toBe(true);
    expect(isProtectedChangeError(new Error("nope"))).toBe(false);
  });
});

describe("validateCreateProtectedChangeInput", () => {
  it("requires a requester and draft version ids", () => {
    expect(() =>
      validateCreateProtectedChangeInput({
        requester: {},
        draftVersionIds: [],
      } as never),
    ).toThrow(ProtectedChangeError);
    expect(() =>
      validateCreateProtectedChangeInput({
        requester: { userId: "usr_00000000000000000000000001" as never },
        draftVersionIds: [],
      } as never),
    ).toThrow(ProtectedChangeError);
  });
});

describe("noopHighAssuranceDenied", () => {
  it("resolves without throwing", async () => {
    await expect(
      noopHighAssuranceDenied({
        code: "auth.high_assurance_required",
        message: "challenge required",
        retryable: false,
      } as never),
    ).resolves.toBeUndefined();
  });
});
