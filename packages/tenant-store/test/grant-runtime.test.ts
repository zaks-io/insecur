import { describe, expect, it } from "vitest";

import { appGrantRoleNames } from "../scripts/grant-runtime.mjs";

describe("appGrantRoleNames", () => {
  it("returns runtime role alone when migration role is missing", () => {
    expect(appGrantRoleNames(null, "insecur_runtime")).toEqual(["insecur_runtime"]);
  });

  it("returns migration role alone when runtime role is missing", () => {
    expect(appGrantRoleNames("insecur_migration", null)).toEqual(["insecur_migration"]);
  });

  it("deduplicates when both roles resolve to the same name", () => {
    expect(appGrantRoleNames("insecur_runtime", "insecur_runtime")).toEqual(["insecur_runtime"]);
  });

  it("returns both roles when migration and runtime differ", () => {
    expect(appGrantRoleNames("insecur_migration", "insecur_runtime")).toEqual([
      "insecur_migration",
      "insecur_runtime",
    ]);
  });

  it("returns an empty list when neither role resolves", () => {
    expect(appGrantRoleNames(null, null)).toEqual([]);
  });
});
