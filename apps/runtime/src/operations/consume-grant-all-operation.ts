import { consumeInjectionGrantAll } from "@insecur/runtime-injection";
import type { ConsumeGrantAllRpcInput, RuntimeDeliveryAllEnvelope } from "@insecur/worker-kit";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";
import { runtimeDeliveryAllEnvelope } from "../runtime-delivery-envelope.js";

type ConsumeGrantAllAuditActor = Parameters<typeof consumeInjectionGrantAll>[0]["actor"];

export interface ConsumeGrantAllOperationInput {
  readonly env: RuntimeEnv;
  readonly input: ConsumeGrantAllRpcInput;
  readonly auditActor: ConsumeGrantAllAuditActor;
}

export async function consumeGrantAllOperation({
  env,
  input,
  auditActor,
}: ConsumeGrantAllOperationInput): Promise<RuntimeDeliveryAllEnvelope> {
  const result = await consumeInjectionGrantAll({
    keyring: createKeyringFromRuntimeEnv(env),
    organizationId: input.organizationId,
    grantId: input.grantId,
    actor: auditActor,
    request: { requestId: input.requestId },
  });
  return runtimeDeliveryAllEnvelope(
    {
      grantId: input.grantId,
      entries: result.entries.map((entry) => ({
        secretId: entry.secretId,
        secretVersionId: entry.secretVersionId,
        variableKey: entry.variableKey,
        valueUtf8: entry.valueUtf8,
      })),
      ...(result.auditEventId !== undefined ? { auditEventId: result.auditEventId } : {}),
    },
    { requestId: input.requestId },
  );
}
