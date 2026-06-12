import type { PlaintextHandle } from "@insecur/crypto";
import { bytesToBase64Url, type MetadataEnvelopeMeta } from "@insecur/domain";
import type { InjectionGrantId, SecretId, SecretVersionId, VariableKey } from "@insecur/domain";

/** Runtime delivery payload for grant consume (not metadata-only). */
export interface RuntimeDeliveryPayload {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  variableKey: VariableKey;
  grantId: InjectionGrantId;
  /** Base64url-encoded UTF-8 bytes for immediate process injection only. */
  encodedValueUtf8: string;
  auditEventId?: string;
}

export interface RuntimeDeliveryEnvelope {
  readonly ok: true;
  readonly delivery: RuntimeDeliveryPayload;
  readonly meta?: MetadataEnvelopeMeta;
}

export function runtimeDeliveryEnvelope(
  input: Omit<RuntimeDeliveryPayload, "encodedValueUtf8"> & { valueUtf8: PlaintextHandle },
  meta?: MetadataEnvelopeMeta,
): RuntimeDeliveryEnvelope {
  const { valueUtf8, ...metadata } = input;
  return {
    ok: true,
    delivery: {
      ...metadata,
      encodedValueUtf8: bytesToBase64Url(valueUtf8.unwrapUtf8()),
    },
    ...(meta !== undefined ? { meta } : {}),
  };
}
