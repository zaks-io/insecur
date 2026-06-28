export function formatConformanceReport<T>(
  title: string,
  violations: readonly T[],
  formatViolation: (violation: T) => string = formatUnknownViolation,
): string {
  return [title, ...violations.map((violation) => `- ${formatViolation(violation)}`)].join("\n");
}

export function throwIfConformanceViolations<T>(
  violations: readonly T[],
  createError: (violations: readonly T[]) => Error,
): void {
  if (violations.length > 0) {
    throw createError(violations);
  }
}

function formatUnknownViolation(violation: unknown): string {
  return typeof violation === "string" ? violation : String(violation);
}
