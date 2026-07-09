import { describe, expect, it } from "vitest";

import {
  isWithinRollbackRetentionWindow,
  ROLLBACK_RETENTION_WINDOW_DAYS,
} from "../src/secrets/rollback-retention-window.js";

const NOW = new Date("2026-07-08T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("isWithinRollbackRetentionWindow", () => {
  it("is eligible the instant a version publishes", () => {
    expect(isWithinRollbackRetentionWindow(NOW, NOW)).toBe(true);
  });

  it("is eligible exactly at the boundary of the window", () => {
    const publishedAt = new Date(NOW.getTime() - ROLLBACK_RETENTION_WINDOW_DAYS * DAY_MS);
    expect(isWithinRollbackRetentionWindow(publishedAt, NOW)).toBe(true);
  });

  it("is ineligible one millisecond past the window", () => {
    const publishedAt = new Date(NOW.getTime() - ROLLBACK_RETENTION_WINDOW_DAYS * DAY_MS - 1);
    expect(isWithinRollbackRetentionWindow(publishedAt, NOW)).toBe(false);
  });

  it("fails closed when publishedAt is null", () => {
    expect(isWithinRollbackRetentionWindow(null, NOW)).toBe(false);
  });

  it("fails closed when publishedAt is undefined", () => {
    expect(isWithinRollbackRetentionWindow(undefined, NOW)).toBe(false);
  });

  it("honors a custom window size", () => {
    const publishedAt = new Date(NOW.getTime() - 5 * DAY_MS);
    expect(isWithinRollbackRetentionWindow(publishedAt, NOW, 3)).toBe(false);
    expect(isWithinRollbackRetentionWindow(publishedAt, NOW, 7)).toBe(true);
  });
});
