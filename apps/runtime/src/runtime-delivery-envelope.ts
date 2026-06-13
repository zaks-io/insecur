import type { PlaintextHandle } from "@insecur/crypto";
import { bytesToBase64Url, type MetadataEnvelopeMeta } from "@insecur/domain";
import type { RuntimeDeliveryEnvelope, RuntimeDeliveryPayload } from "@insecur/worker-kit";

/**
 * Seal a consumed grant's plaintext into the encoded delivery envelope. This is the only place
 * `PlaintextHandle` is unwrapped to bytes; the result is base64url and structured-clone safe, so
 * it is what crosses the RPC seam back to the API. The wire shape is the worker-kit contract type.
 */
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
