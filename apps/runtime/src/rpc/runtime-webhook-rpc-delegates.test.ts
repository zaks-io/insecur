import {
  organizationId,
  parseDisplayName,
  requestId,
  userId,
  webhookSubscriptionId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import {
  createWebhookSubscriptionRpc,
  deleteWebhookSubscriptionRpc,
  listWebhookEventCodesRpc,
  listWebhookSubscriptionsRpc,
  rotateWebhookSigningSecretRpc,
  updateWebhookSubscriptionRpc,
} from "./runtime-webhook-rpc-delegates.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const SUBSCRIPTION = webhookSubscriptionId.brand("whsub_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");

function displayName(raw: string) {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

vi.mock("../operations/webhook-subscription-operations.js", () => ({
  createWebhookSubscriptionOperation: vi.fn(async () => ({
    subscriptionId: "whsub_00000000000000000000000001",
    signingSecret: "secret",
  })),
  listWebhookSubscriptionsOperation: vi.fn(async () => ({ subscriptions: [] })),
  updateWebhookSubscriptionOperation: vi.fn(async () => ({
    subscriptionId: "whsub_00000000000000000000000001",
    organizationId: ORG,
  })),
  deleteWebhookSubscriptionOperation: vi.fn(async () => undefined),
  rotateWebhookSigningSecretOperation: vi.fn(async () => ({ signingSecret: "rotated" })),
  listWebhookEventCodesOperation: vi.fn(async () => ({
    eventCodes: ["secret.non_protected_write"],
  })),
}));

describe("runtime webhook rpc delegates", () => {
  it("forwards each webhook RPC through the post-auth runner", async () => {
    const post = vi.fn(async (_token, run) => ({
      ok: true as const,
      value: await run({
        auditActor: { type: "user", userId: USER },
        accessActor: { type: "user", userId: USER },
        actor: { type: "user", userId: USER },
      }),
    }));
    const env = {} as never;
    const baseInput = {
      actorToken: "token",
      requestId: REQ,
      organizationId: ORG,
    };

    await expect(
      createWebhookSubscriptionRpc(post, env, {
        ...baseInput,
        displayName: displayName("Alerts"),
        eventCodes: [],
        enableEmailChannel: false,
        enableInAppChannel: true,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(listWebhookSubscriptionsRpc(post, env, baseInput)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      updateWebhookSubscriptionRpc(post, env, {
        ...baseInput,
        subscriptionId: SUBSCRIPTION,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      deleteWebhookSubscriptionRpc(post, env, {
        ...baseInput,
        subscriptionId: SUBSCRIPTION,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      rotateWebhookSigningSecretRpc(post, env, {
        ...baseInput,
        subscriptionId: SUBSCRIPTION,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(listWebhookEventCodesRpc(post, env, baseInput)).resolves.toMatchObject({
      ok: true,
    });

    expect(post).toHaveBeenCalledTimes(6);
  });
});
