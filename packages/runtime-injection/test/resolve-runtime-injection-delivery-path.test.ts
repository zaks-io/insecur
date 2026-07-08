import { ENVIRONMENT_LIFECYCLE_STAGES } from "@insecur/domain";
import {
  FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH,
  PRODUCTION_DELIVERY_PATHS,
} from "@insecur/storage-security-gate";
import { describe, expect, it } from "vitest";

import { resolveRuntimeInjectionDeliveryPath } from "../src/resolve-runtime-injection-delivery-path.js";

describe("resolveRuntimeInjectionDeliveryPath", () => {
  it("uses the First Value carve-out for non-protected development environments", () => {
    expect(
      resolveRuntimeInjectionDeliveryPath({
        lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.development,
        isProtected: false,
      }),
    ).toBe(FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH);
  });

  it("requires the production gate for protected environments", () => {
    expect(
      resolveRuntimeInjectionDeliveryPath({
        lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.preview,
        isProtected: true,
      }),
    ).toBe(PRODUCTION_DELIVERY_PATHS.runtimeInjection);
  });

  it("requires the production gate for staging and production lifecycle stages", () => {
    for (const lifecycleStage of [
      ENVIRONMENT_LIFECYCLE_STAGES.staging,
      ENVIRONMENT_LIFECYCLE_STAGES.production,
    ] as const) {
      expect(
        resolveRuntimeInjectionDeliveryPath({
          lifecycleStage,
          isProtected: true,
        }),
      ).toBe(PRODUCTION_DELIVERY_PATHS.runtimeInjection);
    }
  });

  it("honors an explicit delivery path override", () => {
    expect(
      resolveRuntimeInjectionDeliveryPath(
        {
          lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.development,
          isProtected: false,
        },
        PRODUCTION_DELIVERY_PATHS.runtimeInjection,
      ),
    ).toBe(PRODUCTION_DELIVERY_PATHS.runtimeInjection);
  });
});
