/** Stable delivery-denial codes when the Storage Security Gate blocks production delivery. */
export const STORAGE_GATE_ERROR_CODES = {
  gateBlocked: "storage.gate_blocked",
  gateUnknown: "storage.gate_unknown",
} as const;

export type StorageGateDeliveryErrorCode =
  (typeof STORAGE_GATE_ERROR_CODES)[keyof typeof STORAGE_GATE_ERROR_CODES];
