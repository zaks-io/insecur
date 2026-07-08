/** Shared dotenv assignment key validation for scan classification and Secret Import. */
const DOTENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export function normalizeDotenvLineBody(trimmed: string): string {
  return trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : trimmed;
}

export function splitDotenvAssignmentBody(
  body: string,
): { readonly rawKey: string; readonly valuePortion: string } | null {
  const eqIndex = body.indexOf("=");
  if (eqIndex <= 0) {
    return null;
  }

  const rawKey = body.slice(0, eqIndex).trim();
  if (rawKey.length === 0 || !DOTENV_KEY_PATTERN.test(rawKey)) {
    return null;
  }

  return {
    rawKey,
    valuePortion: body.slice(eqIndex + 1),
  };
}
