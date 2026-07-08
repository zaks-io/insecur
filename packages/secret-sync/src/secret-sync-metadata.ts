import {
  brandOpaqueResourceIdForPrefix,
  type OpaqueResourceId,
  type SecretSyncBindingId,
  type SecretSyncId,
} from "@insecur/domain";

export const SECRET_SYNC_BINDING_DESTINATION_METADATA_TYPE = "secret_sync.binding" as const;
export const SECRET_SYNC_BINDING_DESTINATION_FIELD = "provider_destination" as const;

export const SECRET_SYNC_TARGET_METADATA_TYPE = "secret_sync.target" as const;
export const SECRET_SYNC_TARGET_WORKER_SCRIPT_FIELD = "worker_script" as const;

export function secretSyncBindingRecordResourceId(
  bindingId: SecretSyncBindingId,
): OpaqueResourceId {
  return brandOpaqueResourceIdForPrefix("sbind", bindingId);
}

export function secretSyncTargetRecordResourceId(secretSyncId: SecretSyncId): OpaqueResourceId {
  return brandOpaqueResourceIdForPrefix("sync", secretSyncId);
}
