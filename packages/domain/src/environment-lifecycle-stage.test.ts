import { describe, expect, it } from "vitest";

import {
  ENVIRONMENT_LIFECYCLE_STAGES,
  isEnvironmentLifecycleStage,
} from "./environment-lifecycle-stage.js";

describe("isEnvironmentLifecycleStage", () => {
  it("accepts known lifecycle stages", () => {
    for (const stage of Object.values(ENVIRONMENT_LIFECYCLE_STAGES)) {
      expect(isEnvironmentLifecycleStage(stage)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isEnvironmentLifecycleStage("qa")).toBe(false);
  });
});
