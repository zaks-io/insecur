import { randomUUID } from "node:crypto";

import { invitationId, membershipId } from "@insecur/domain";
import { expect, test as base } from "@playwright/test";

import { mintBearer } from "./auth";
import { waitForPreviewDeployIdentity } from "./deploy-identity";
import { loadPreviewConfig, type PreviewConfig } from "./env";

interface PreviewWorkerFixtures {
  inviteeBearer: string;
  noScopeBearer: string;
  ownerBearer: string;
  preview: PreviewConfig;
  previewIdentityReady: boolean;
}

export const test = base.extend<object, PreviewWorkerFixtures>({
  inviteeBearer: [
    async ({ preview }, use) => {
      await use(
        await mintBearer({
          rawUserId: preview.inviteeUserId,
          sessionId: "session_preview_smoke_invitee",
          signingSecret: preview.signingSecret,
          workosUserId: preview.inviteeWorkosUserId,
        }),
      );
    },
    { scope: "worker" },
  ],
  noScopeBearer: [
    async ({ preview }, use) => {
      await use(
        await mintBearer({
          rawUserId: preview.noScopeUserId,
          sessionId: "session_preview_smoke_no_scope",
          signingSecret: preview.signingSecret,
          workosUserId: preview.noScopeWorkosUserId,
        }),
      );
    },
    { scope: "worker" },
  ],
  ownerBearer: [
    async ({ preview }, use) => {
      await use(
        await mintBearer({
          rawUserId: preview.ownerUserId,
          sessionId: "session_preview_smoke_owner",
          signingSecret: preview.signingSecret,
          workosUserId: preview.ownerWorkosUserId,
        }),
      );
    },
    { scope: "worker" },
  ],
  preview: [
    async ({ browserName: _browserName }, use) => {
      void _browserName;
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
export * from "./audit-verification";
export * from "./auth";
export * from "./denied-response";
export * from "./http";
export * from "./metadata-read-probes";
export * from "./plaintext-sweep";
export * from "./redaction";
