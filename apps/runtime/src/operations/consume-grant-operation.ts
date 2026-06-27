import { consumeInjectionGrant } from "@insecur/runtime-injection";
import type { ConsumeGrantRpcInput, RuntimeDeliveryEnvelope } from "@insecur/worker-kit";

import { createKeyringFromRuntimeEnv } from "../crypto/keyring-context.js";
import type { RuntimeEnv } from "../env.js";
import { runtimeDeliveryEnvelope } from "../runtime-delivery-envelope.js";

type ConsumeGrantAuditActor = Parameters<typeof consumeInjectionGrant>[0]["actor"];

export interface ConsumeGrantOperationInput {
  readonly env: RuntimeEnv;
  readonly input: ConsumeGrantRpcInput;
  readonly auditActor: ConsumeGrantAuditActor;
}

export async function consumeGrantOperation({
  env,
  input,
  auditActor,
}: ConsumeGrantOperationInput): Promise<RuntimeDeliveryEnvelope> {
  const result = await consumeInjectionGrant({
    keyring: createKeyringFromRuntimeEnv(env),
    organizationId: input.organizationId,
    grantId: input.grantId,
    ...(input.variableKey !== undefined ? { variableKey: input.variableKey } : {}),
    ...(input.secretId !== undefined ? { secretId: input.secretId } : {}),
    actor: auditActor,
    request: { requestId: input.requestId },
  });
  return runtimeDeliveryEnvelope(
    {
      grantId: input.grantId,
      secretId: result.secretId,
      secretVersionId: result.secretVersionId,
      variableKey: result.variableKey,
      valueUtf8: result.valueUtf8,
      ...(result.auditEventId !== undefined ? { auditEventId: result.auditEventId } : {}),
    },
    { requestId: input.requestId },
  );
}
