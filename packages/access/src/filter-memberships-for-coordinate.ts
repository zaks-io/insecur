import type { MembershipRow } from "./membership-row.js";
import type { ResourceCoordinate } from "./resolve-effective-access.js";

/** Membership rows that apply at the requested organization/project coordinate. */
export function filterMembershipsForCoordinate(
  memberships: readonly MembershipRow[],
  coordinate: ResourceCoordinate,
): readonly MembershipRow[] {
  return memberships.filter((membership) => {
    if (membership.projectId === null) {
      return true;
    }
    if (coordinate.projectId === undefined) {
      return false;
    }
    return membership.projectId === coordinate.projectId;
  });
}
