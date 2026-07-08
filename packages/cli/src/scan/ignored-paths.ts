export const PROJECT_IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".nyc_output",
  ".cache",
  ".turbo",
  ".parcel-cache",
]);

export function isIgnoredProjectPath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/");
  return normalized.split("/").some((segment) => PROJECT_IGNORED_DIR_NAMES.has(segment));
}
