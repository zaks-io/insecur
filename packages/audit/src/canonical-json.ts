function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalizeValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const sortedEntries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  const canonical: Record<string, unknown> = {};
  for (const [key, child] of sortedEntries) {
    canonical[key] = canonicalizeValue(child);
  }
  return canonical;
}

/** Deterministic JSON for hash-chain and manifest signing inputs. */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}
