import { isCredentialScope, type CredentialScope } from "@insecur/access";

export function parseCredentialScopeRows(scopes: string[]): readonly CredentialScope[] | null {
  const parsed: CredentialScope[] = [];
  for (const scope of scopes) {
    if (!isCredentialScope(scope)) {
      return null;
    }
    parsed.push(scope);
  }
  return parsed.length > 0 ? parsed : null;
}
