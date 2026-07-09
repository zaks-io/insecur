import { afterEach, describe, expect, it } from "vitest";
import {
  configureIdTruncation,
  humanizeTtl,
  relativeTime,
  resetIdTruncationForTests,
  statusTone,
  truncateId,
} from "../src/output/cell-format.js";

afterEach(() => {
  resetIdTruncationForTests();
});

describe("truncateId", () => {
  it("keeps the prefix whole and truncates the tail", () => {
    expect(truncateId("env_NZ1PSC2H1FJ7NGNFQQVN1DVKYZ")).toBe("env_NZ1PSC…");
  });

  it("leaves short ids intact", () => {
    expect(truncateId("env_ABC")).toBe("env_ABC");
  });

  it("uses an ASCII ellipsis when requested", () => {
    expect(truncateId("grant_ABCDEFGHIJK", true)).toBe("grant_ABCDEF...");
  });

  it("returns the full id when truncation is disabled (--full)", () => {
    configureIdTruncation(true);
    expect(truncateId("env_NZ1PSC2H1FJ7NGNFQQVN1DVKYZ")).toBe("env_NZ1PSC2H1FJ7NGNFQQVN1DVKYZ");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-07-09T12:00:00Z");
  it("renders recent instants relatively", () => {
    expect(relativeTime("2026-07-09T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-07-09T11:57:00Z", now)).toBe("3m ago");
    expect(relativeTime("2026-07-09T10:00:00Z", now)).toBe("2h ago");
    expect(relativeTime("2026-07-07T12:00:00Z", now)).toBe("2d ago");
    expect(relativeTime("2026-06-25T12:00:00Z", now)).toBe("2w ago");
  });

  it("rolls over to a compact date past four weeks", () => {
    expect(relativeTime("2026-05-10T12:00:00Z", now)).toBe("May 10");
    expect(relativeTime("2025-03-04T12:00:00Z", now)).toBe("Mar 4 2025");
  });

  it("renders future instants with an 'in' prefix", () => {
    expect(relativeTime("2026-07-09T18:00:00Z", now)).toBe("in 6h");
  });

  it("renders an em-dash for missing or invalid input", () => {
    expect(relativeTime(undefined, now)).toBe("—");
    expect(relativeTime("", now)).toBe("—");
    expect(relativeTime("not-a-date", now)).toBe("—");
  });
});

describe("humanizeTtl", () => {
  it("prefers hours, then minutes, then seconds", () => {
    expect(humanizeTtl(3600)).toBe("1h");
    expect(humanizeTtl(900)).toBe("15m");
    expect(humanizeTtl(45)).toBe("45s");
  });
});

describe("statusTone", () => {
  it("maps healthy/transitional/broken/inert values", () => {
    expect(statusTone("live")).toBe("ok");
    expect(statusTone("draft")).toBe("warn");
    expect(statusTone("revoked")).toBe("danger");
    expect(statusTone("retained")).toBe("muted");
  });

  it("falls through to muted for unknown values", () => {
    expect(statusTone("some_new_server_enum")).toBe("muted");
  });
});
