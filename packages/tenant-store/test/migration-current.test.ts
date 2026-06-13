import { describe, expect, it } from "vitest";
import { readExpectedMigrationJournalTail } from "../scripts/lib/migration-current.mjs";

describe("migration-current", () => {
  it("reads the journal tail hash for the head migration", () => {
    const tail = readExpectedMigrationJournalTail();
    expect(tail.folderMillis).toBeGreaterThan(0);
    expect(tail.hash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
