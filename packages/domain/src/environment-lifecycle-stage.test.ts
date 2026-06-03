import { describe, expect, it } from "vitest";

import {
  ENVIRONMENT_LIFECYCLE_STAGES,
  isEnvironmentLifecycleStage,
} from "./environment-lifecycle-stage.js";

describe("environment lifecycle stage", () => {
  it("recognizes the four posture tiers", () => {
    expect(isEnvironmentLifecycleStage(ENVIRONMENT_LIFECYCLE_STAGES.development)).toBe(true);
    expect(isEnvironmentLifecycleStage(ENVIRONMENT_LIFECYCLE_STAGES.preview)).toBe(true);
    expect(isEnvironmentLifecycleStage(ENVIRONMENT_LIFECYCLE_STAGES.staging)).toBe(true);
    expect(isEnvironmentLifecycleStage(ENVIRONMENT_LIFECYCLE_STAGES.production)).toBe(true);
    expect(isEnvironmentLifecycleStage("sandbox")).toBe(false);
  });
});
