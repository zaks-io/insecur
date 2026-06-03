type WithoutUndefined<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: Exclude<T[K], undefined>;
};

/** Omits object entries whose values are `undefined` (exactOptionalPropertyTypes-safe spreads). */
export function omitUndefinedFields<T extends Record<string, unknown>>(
  fields: T,
): WithoutUndefined<T> {
  const result = {} as WithoutUndefined<T>;
  for (const key of Object.keys(fields) as (keyof T)[]) {
    const value = fields[key];
    if (value !== undefined) {
      result[key as keyof WithoutUndefined<T>] =
        value as WithoutUndefined<T>[keyof WithoutUndefined<T>];
    }
  }
  return result;
}
