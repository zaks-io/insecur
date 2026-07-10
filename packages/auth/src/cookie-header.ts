/**
 * Strict security-cookie reader for browser auth material (INS-583).
 *
 * A Cookie header may legitimately carry two cookies with the same name (host-only vs
 * Domain variant, or differing paths), and header order decides which one a naive parser
 * keeps. For session, CSRF, and PKCE cookies that ambiguity is attacker-usable via
 * sibling-domain cookie tossing, so duplicates fail closed: the value is returned only
 * when the exact name appears exactly once.
 */
export function readSingleCookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | undefined {
  if (cookieHeader === undefined || cookieHeader === null || cookieHeader === "") {
    return undefined;
  }
  const values = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  const value = values.length === 1 ? values[0] : undefined;
  return value === "" ? undefined : value;
}
