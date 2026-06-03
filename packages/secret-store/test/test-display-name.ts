import { brandValue, parseDisplayName, type DisplayName } from "@insecur/domain";

export function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

export function forgedDisplayName(raw: string): DisplayName {
  return brandValue<string, "DisplayName">(raw);
}
