import {
  assertEnvelopeData,
  assertMetadataReadEnvelope,
  assertResponseFreeOfRedactedPatterns,
  authHeaders,
  findById,
  getJson,
  mintSmokeSentinel,
  postJson,
  provisionFirstValueCoords,
  redactorFor,
  requireObjectArray,
  requireString,
  runPlaintextSweep,
  test,
  type JsonRecord,
  type Sentinel,
} from "../src/fixtures";

test("preview webhook subscription signing secret is returned once and never re-exposed @preview @custody @webhooks", async ({
  ownerBearer,
  preview,
}) => {
  test.setTimeout(180_000);

  const sentinel = mintSmokeSentinel();
  const initialRedactor = redactorFor(preview, sentinel, [ownerBearer]);
  const variableKey = `SMOKE_WEBHOOK_SECRET_${String(Date.now())}`;
  let baseUrl = "";
  let subscriptionId = "";
  let secretRedactor = initialRedactor;

  try {
    const coords = await test.step("provision.first_value", async () =>
      provisionFirstValueCoords({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: ownerBearer,
        redactor: initialRedactor,
        sentinel,
        variableKey,
      }));

    baseUrl = `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/webhook-subscriptions`;

    const createData =
      await test.step("webhook_subscription.create_returns_one_time_secret", async () => {
        const body = await postJson({
          bearer: ownerBearer,
          body: {
            displayName: `Preview smoke webhook ${String(Date.now())}`,
            enableInAppChannel: true,
            eventCodes: ["secret.non_protected_write"],
          },
          label: "Webhook subscription create",
          redactor: initialRedactor,
          url: baseUrl,
        });
        return assertEnvelopeData(body, "Webhook subscription create");
      });

    subscriptionId = requireString(
      createData.subscriptionId,
      "Webhook subscription create subscriptionId",
    );
    const createdSigningSecret = requireString(
      createData.signingSecret,
      "Webhook subscription create signingSecret",
    );
    secretRedactor = redactorFor(preview, sentinel, [ownerBearer, createdSigningSecret]);

    await test.step("webhook_subscription.list_hides_created_secret", async () => {
      const body = await getJson(
        baseUrl,
        "Webhook subscription list after create",
        { headers: authHeaders(ownerBearer) },
        secretRedactor,
      );
      assertResponseFreeOfRedactedPatterns(
        secretRedactor,
        body,
        "Webhook subscription list after create",
      );
      const data = assertMetadataReadEnvelope(body, "Webhook subscription list after create");
      const row = findSubscription(data, subscriptionId, "Webhook subscription list after create");
      assertNoSigningSecretField(row, "Webhook subscription list after create");
    });

    const rotateData =
      await test.step("webhook_subscription.rotate_returns_new_one_time_secret", async () => {
        const body = await postJson({
          bearer: ownerBearer,
          body: {},
          label: "Webhook subscription rotate",
          redactor: secretRedactor,
          url: `${baseUrl}/${subscriptionId}/rotate-signing-secret`,
        });
        return assertEnvelopeData(body, "Webhook subscription rotate");
      });

    const rotatedSigningSecret = requireString(
      rotateData.signingSecret,
      "Webhook subscription rotate signingSecret",
    );
    if (rotatedSigningSecret === createdSigningSecret) {
      throw new Error("Webhook subscription rotate returned the previous signing secret.");
    }
    secretRedactor = redactorFor(preview, sentinel, [
      ownerBearer,
      createdSigningSecret,
      rotatedSigningSecret,
    ]);

    await test.step("webhook_subscription.list_hides_rotated_secrets", async () => {
      const body = await getJson(
        baseUrl,
        "Webhook subscription list after rotate",
        { headers: authHeaders(ownerBearer) },
        secretRedactor,
      );
      assertResponseFreeOfRedactedPatterns(
        secretRedactor,
        body,
        "Webhook subscription list after rotate",
      );
      const data = assertMetadataReadEnvelope(body, "Webhook subscription list after rotate");
      const row = findSubscription(data, subscriptionId, "Webhook subscription list after rotate");
      assertNoSigningSecretField(row, "Webhook subscription list after rotate");
    });

    await test.step("plaintext_sweep.webhook_signing_secrets", async () => {
      for (const [label, value] of [
        ["created", createdSigningSecret],
        ["rotated", rotatedSigningSecret],
      ] as const) {
        const sweep = await runPlaintextSweep(preview.databaseUrl, sentinelForPlaintext(value));
        if (sweep.hits.length > 0) {
          throw new Error(
            `Webhook signing secret plaintext sweep found ${label} secret hit(s): ${JSON.stringify(sweep.hits)}`,
          );
        }
      }
    });
  } finally {
    if (subscriptionId !== "") {
      await deleteSubscriptionBestEffort({
        bearer: ownerBearer,
        url: `${baseUrl}/${subscriptionId}`,
      });
    }
  }
});

function findSubscription(data: JsonRecord, subscriptionId: string, label: string): JsonRecord {
  const subscriptions = requireObjectArray(data.subscriptions, `${label} subscriptions`);
  return findById(subscriptions, "subscriptionId", subscriptionId, label);
}

function assertNoSigningSecretField(value: JsonRecord, label: string): void {
  if (Object.prototype.hasOwnProperty.call(value, "signingSecret")) {
    throw new Error(`${label} exposed a signingSecret field.`);
  }
}

function sentinelForPlaintext(value: string): Sentinel {
  return {
    fingerprint: "webhook-signing-secret",
    value,
    variants: [{ encoding: "raw", pattern: value }],
  };
}

async function deleteSubscriptionBestEffort(input: {
  readonly bearer: string;
  readonly url: string;
}): Promise<void> {
  try {
    await fetch(input.url, {
      headers: authHeaders(input.bearer),
      method: "DELETE",
    });
  } catch {
    // Cleanup is best effort; the proof above does not depend on delete succeeding.
  }
}
