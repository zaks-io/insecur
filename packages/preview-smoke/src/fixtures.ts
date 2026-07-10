import { randomUUID } from "node:crypto";

import { invitationId, membershipId, runtimePolicyId } from "@insecur/domain";
import { expect, test as base } from "@playwright/test";

import { mintBearer } from "./auth";
import { loadPreviewConfig, type PreviewConfig } from "./env";

interface PreviewWorkerFixtures {
  inviteeBearer: string;
  noScopeBearer: string;
  ownerBearer: string;
  preview: PreviewConfig;
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
});

export { expect, invitationId, membershipId, randomUUID, runtimePolicyId };
export * from "./audit-export-artifact";
export * from "./audit-verification";
export * from "./auth";
export * from "./cli-agent-attribution-assertions";
export * from "./cli-audit-metadata-assertions";
export * from "./cli-auth-assertions";
export * from "./cli-operations-run-policies-assertions";
export * from "./cli-smoke";
export * from "./denied-response";
export * from "./first-value-coords";
export * from "./high-assurance-challenge-seed";
export * from "./http";
export * from "./metadata-read-assertions";
export * from "./metadata-read-probes";
export * from "./operation-poll-probe";
export * from "./plaintext-sweep";
export * from "./protected-change-seed";
export * from "./redaction";
