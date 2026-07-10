import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const journal = JSON.parse(readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8")) as {
  entries: JournalEntry[];
};

/**
 * The Drizzle migrator applies a migration only when its journal `when` exceeds the max
 * `created_at` already recorded in drizzle.__drizzle_migrations. A journal entry whose `when` is
 * not strictly greater than every earlier entry is silently skipped on any database that already
 * applied a later-stamped migration (this happened to 0027/0028 on preview and production).
 */
describe("drizzle migration journal", () => {
  it("has contiguous idx values starting at 0", () => {
    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_, index) => index),
    );
  });

  it("has strictly increasing when timestamps so no migration can be skipped", () => {
    for (let i = 1; i < journal.entries.length; i += 1) {
      const previous = journal.entries[i - 1] as JournalEntry;
      const current = journal.entries[i] as JournalEntry;
      expect(
        current.when,
        `journal entry ${current.tag} (when=${current.when}) must be stamped after ` +
          `${previous.tag} (when=${previous.when}); bump its "when" above every earlier entry ` +
          `or the migrator will silently skip it on databases that already applied ${previous.tag}`,
      ).toBeGreaterThan(previous.when);
    }
  });

  it("has a migration file for every journal entry", () => {
    for (const entry of journal.entries) {
      expect(existsSync(join(drizzleDir, `${entry.tag}.sql`)), `${entry.tag}.sql missing`).toBe(
        true,
      );
    }
  });
});
