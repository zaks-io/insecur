declare const brand: unique symbol;

/** Nominal brand for primitive string shapes. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export function brandValue<T extends string, B extends string>(value: T): Brand<T, B> {
  return value as Brand<T, B>;
}
