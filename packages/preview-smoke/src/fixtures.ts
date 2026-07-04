import { randomUUID } from "node:crypto";

import { invitationId, membershipId } from "@insecur/domain";
import { expect, test as base } from "@playwright/test";

import { mintBearer } from "./auth";
import { waitForPreviewDeployIdentity } from "./deploy-identity";
import { loadPreviewConfig, type PreviewConfig } from "./env";

interface PreviewWorkerFixtures {
  inviteeBearer: string;
  ownerBearer: string;
  preview: PreviewConfig;
  previewIdentityReady: boolean;
}

export const test = base.extend<object, PreviewWorkerFixtures>({
  inviteeBearer: [
    async ({ preview }, use) => {
      await use(
        await mintBearer(
          preview.inviteeUserId,
          preview.inviteeWorkosUserId,
          preview.signingSecret,
          "session_preview_smoke_invitee",
        ),
      );
    },
    { scope: "worker" },
  ],
  ownerBearer: [
    async ({ preview }, use) => {
      await use(
        await mintBearer(
          preview.ownerUserId,
          preview.ownerWorkosUserId,
          preview.signingSecret,
          "session_preview_smoke_owner",
        ),
      );
    },
    { scope: "worker" },
  ],
  preview: [
    async ({ browserName }, use) => {
      void browserName;
      await use(loadPreviewConfig());
    },
    { scope: "worker" },
  ],
  previewIdentityReady: [
    async ({ preview }, use) => {
      await waitForPreviewDeployIdentity(preview);
      await use(true);
    },
    { auto: true, scope: "worker" },
  ],
});

export { expect, invitationId, membershipId, randomUUID };
export * from "./auth";
export * from "./http";
export * from "./plaintext-sweep";
export * from "./redaction";
