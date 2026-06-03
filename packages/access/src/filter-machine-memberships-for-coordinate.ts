import type { MachineMembershipRow } from "./machine-membership-row.js";
import type { ResourceCoordinate } from "./resolve-effective-access.js";

/** Machine membership rows that apply at the requested project coordinate. */
export function filterMachineMembershipsForCoordinate(
  memberships: readonly MachineMembershipRow[],
  coordinate: ResourceCoordinate,
): readonly MachineMembershipRow[] {
  if (coordinate.projectId === undefined) {
    return [];
  }
  return memberships.filter((membership) => membership.projectId === coordinate.projectId);
}
