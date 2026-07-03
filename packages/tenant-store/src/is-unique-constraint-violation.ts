export function isUniqueConstraintViolation(error: unknown): boolean {
  let current: unknown = error;

  while (typeof current === "object" && current !== null) {
    if ("code" in current && (current as { code: string }).code === "23505") {
      return true;
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }

  return false;
}
