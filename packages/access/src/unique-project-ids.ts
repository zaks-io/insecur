import type { ProjectId } from "@insecur/domain";
import type { ResourceCoordinate } from "./resolve-effective-access.js";

/** Unique project IDs referenced by a coordinate batch (preserves first-seen order). */
export function uniqueProjectIdsFromCoordinates(
  coordinates: readonly ResourceCoordinate[],
): readonly ProjectId[] {
  const seen = new Set<string>();
  const projectIds: ProjectId[] = [];
  for (const coordinate of coordinates) {
    if (coordinate.projectId === undefined) {
      continue;
    }
    if (seen.has(coordinate.projectId)) {
      continue;
    }
    seen.add(coordinate.projectId);
    projectIds.push(coordinate.projectId);
  }
  return projectIds;
}
