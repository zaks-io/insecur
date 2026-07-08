type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (
  value: infer I,
) => void
  ? I
  : never;

/**
 * Merges per-domain audit event code objects into one registry object.
 * Throws when the same dotted code value appears in more than one module.
 */
export function assembleAuditEventCodes<const TModules extends readonly Record<string, string>[]>(
  label: string,
  ...modules: TModules
): UnionToIntersection<TModules[number]> {
  const values = new Map<string, string>();
  const result: Record<string, string> = {};

  for (const module of modules) {
    for (const [key, code] of Object.entries(module)) {
      const existingKey = values.get(code);
      if (existingKey !== undefined) {
        throw new Error(
          `Duplicate audit event code "${code}" in ${label} (keys: ${existingKey}, ${key})`,
        );
      }
      values.set(code, key);
      result[key] = code;
    }
  }

  return result as UnionToIntersection<TModules[number]>;
}

/** Returns duplicate dotted code values across modules for gate tests. */
export function findDuplicateAuditEventCodeValues(
  modules: readonly Readonly<Record<string, string>>[],
): string[] {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const module of modules) {
    for (const [key, code] of Object.entries(module)) {
      const existingKey = seen.get(code);
      if (existingKey !== undefined) {
        duplicates.add(code);
      } else {
        seen.set(code, key);
      }
    }
  }

  return [...duplicates].sort();
}
