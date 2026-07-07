function throwParseError(message: string, code: string): never {
  throw Object.assign(new Error(message), { code });
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; code: string };

export function parseValue<T>(
  raw: string,
  parser: (raw: string) => ParseResult<T>,
  message: string,
): T {
  const parsed = parser(raw);
  if (!parsed.ok) {
    throwParseError(message, parsed.code);
  }
  return parsed.value;
}

export function parseOptionalValue<T>(
  raw: string | undefined,
  parser: (raw: string) => ParseResult<T>,
  message: string,
): T | undefined {
  return raw === undefined ? undefined : parseValue(raw, parser, message);
}
