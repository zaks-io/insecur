/** Lifecycle state for organization and project data key versions. */
export const DATA_KEY_VERSION_STATUSES = ["active", "retired", "revoked"] as const;

export type DataKeyVersionStatus = (typeof DATA_KEY_VERSION_STATUSES)[number];

export function isDataKeyVersionStatus(value: string): value is DataKeyVersionStatus {
  return (DATA_KEY_VERSION_STATUSES as readonly string[]).includes(value);
}
