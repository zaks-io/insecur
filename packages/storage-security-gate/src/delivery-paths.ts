/** Production delivery surfaces that must pass the Storage Security Gate before continuing. */
export const PRODUCTION_DELIVERY_PATHS = {
  secretSync: "production.secret_sync",
  runtimeInjection: "production.runtime_injection",
  providerCredentialUse: "production.provider_credential_use",
} as const;

/** First Value non-protected local Runtime Injection carve-out from the full production gate. */
export const FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH =
  "first_value.local_runtime_injection" as const;

export type ProductionDeliveryPath =
  (typeof PRODUCTION_DELIVERY_PATHS)[keyof typeof PRODUCTION_DELIVERY_PATHS];

export type StorageGateDeliveryPath =
  ProductionDeliveryPath | typeof FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH;

export function requiresProductionStorageSecurityGate(
  path: StorageGateDeliveryPath,
): path is ProductionDeliveryPath {
  return path !== FIRST_VALUE_LOCAL_RUNTIME_INJECTION_PATH;
}
