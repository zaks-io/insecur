/** Lifecycle state for organization and project data key versions. */
export const DATA_KEY_VERSION_STATUSES = ["active", "retired", "revoked"] as const;

export type DataKeyVersionStatus = (typeof DATA_KEY_VERSION_STATUSES)[number];

const ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<DataKeyVersionStatus, readonly DataKeyVersionStatus[]>
> = {
  active: ["retired", "revoked"],
  retired: [],
  revoked: [],
};

export function isDataKeyVersionStatus(value: string): value is DataKeyVersionStatus {
  return (DATA_KEY_VERSION_STATUSES as readonly string[]).includes(value);
}

export function assertDataKeyStatusTransition(
  from: DataKeyVersionStatus,
  to: DataKeyVersionStatus,
): void {
  if (from === to) {
    return;
  }
  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error("invalid data key status transition");
  }
}

/** After root rewrap, active keys keep serving; retired keys stay retired. */
export function statusAfterRootRewrap(current: DataKeyVersionStatus): DataKeyVersionStatus {
  return current;
}

export function canRetireRootKeyBinding(
  organizationKeys: readonly { readonly rootKeyVersion: number }[],
  oldRootVersion: number,
): boolean {
  return organizationKeys.every((key) => key.rootKeyVersion !== oldRootVersion);
}
