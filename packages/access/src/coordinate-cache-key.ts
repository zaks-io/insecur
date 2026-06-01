import type { ResourceCoordinate } from "./resolve-effective-access.js";

export function coordinateCacheKey(coordinate: ResourceCoordinate): string {
  const project = coordinate.projectId ?? "";
  const environment = coordinate.environmentId ?? "";
  return `${coordinate.organizationId}:${project}:${environment}`;
}
