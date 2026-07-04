import { describe, expect, it, vi } from "vitest";
import { injectionGrantId, organizationId, type InjectionGrantId } from "@insecur/domain";
import { recordRunCompletedBestEffort } from "../src/commands/run-shared.js";
import type { ApiClient } from "../src/api/types.js";

const ORG = organizationId.brand("org_01TEST00000000000000000001");
const GRANT = injectionGrantId.brand("igr_01TEST00000000000000000001");

describe("recordRunCompletedBestEffort", () => {
  it("swallows transport failures from recordInjectionRunCompleted", async () => {
    const recordInjectionRunCompleted = vi.fn(async () => {
      throw new Error("network down");
    });
    const api = { recordInjectionRunCompleted } as unknown as ApiClient;

    await expect(
      recordRunCompletedBestEffort({
        api,
        host: "https://insecur.test",
        credential: "credential_test",
        organizationId: ORG,
        grantId: GRANT as InjectionGrantId,
        childExitCode: 0,
      }),
    ).resolves.toBeUndefined();
  });
});
