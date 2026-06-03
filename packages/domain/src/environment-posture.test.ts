import { describe, expect, it } from "vitest";
import {
  ENVIRONMENT_POSTURE_TIERS,
  canSetPreviewAutomationOptIn,
  resolveIsProtectedFromPosture,
} from "./environment-posture.js";
import { userId } from "./resource-ids.js";

describe("resolveIsProtectedFromPosture", () => {
  it("marks development as non-protected", () => {
    expect(resolveIsProtectedFromPosture(ENVIRONMENT_POSTURE_TIERS.development)).toBe(false);
  });

  it("marks staging and production as protected", () => {
    expect(resolveIsProtectedFromPosture(ENVIRONMENT_POSTURE_TIERS.staging)).toBe(true);
    expect(resolveIsProtectedFromPosture(ENVIRONMENT_POSTURE_TIERS.production)).toBe(true);
  });

  it("defaults preview to protected without opt-down evidence", () => {
    expect(resolveIsProtectedFromPosture(ENVIRONMENT_POSTURE_TIERS.preview)).toBe(true);
  });

  it("allows non-protected preview only with explicit opt-down evidence", () => {
    expect(
      resolveIsProtectedFromPosture(ENVIRONMENT_POSTURE_TIERS.preview, {
        optedDownAt: new Date("2026-06-01T00:00:00.000Z"),
        actorUserId: userId.brand("usr_00000000000000000000000001"),
      }),
    ).toBe(false);
  });
});

describe("canSetPreviewAutomationOptIn", () => {
  it("allows opt-in only for non-protected preview environments", () => {
    expect(canSetPreviewAutomationOptIn(ENVIRONMENT_POSTURE_TIERS.preview, false)).toBe(true);
    expect(canSetPreviewAutomationOptIn(ENVIRONMENT_POSTURE_TIERS.preview, true)).toBe(false);
    expect(canSetPreviewAutomationOptIn(ENVIRONMENT_POSTURE_TIERS.development, false)).toBe(false);
  });
});
