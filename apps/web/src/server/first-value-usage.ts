import { createServerFn } from "@tanstack/react-start";
import {
  loadFirstValueUsageForRequest,
  type FirstValueUsageOutcome,
} from "../onboarding/first-value-usage.js";
import { resolveAuthenticatedApiClient } from "./bff-api.js";

/**
 * Pollable First Value usage status for the CLI handoff indicator (INS-379). Metadata only.
 */
export const loadFirstValueUsage = createServerFn({ method: "GET" })
  .validator((organizationId: unknown): string => {
    if (typeof organizationId !== "string" || organizationId === "") {
      throw new Error("organization id required");
    }
    return organizationId;
  })
  .handler(async ({ data: organizationId }): Promise<FirstValueUsageOutcome> => {
    return loadFirstValueUsageForRequest(
      {
        resolveApi: async () => (await resolveAuthenticatedApiClient())?.api ?? null,
      },
      organizationId,
    );
  });
