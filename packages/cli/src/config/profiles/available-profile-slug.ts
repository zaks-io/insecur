import { loadUserConfig } from "../user-config.js";

export async function resolveAvailableProfileSlug(
  requestedSlug: string,
  options: { readonly strict: boolean },
): Promise<string> {
  if (options.strict) {
    return requestedSlug;
  }

  const existing = await loadUserConfig();
  const usedSlugs = new Set(Object.values(existing.profiles).map((profile) => profile.slug));
  if (!usedSlugs.has(requestedSlug)) {
    return requestedSlug;
  }

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${requestedSlug}-${String(suffix)}`;
    if (!usedSlugs.has(candidate)) {
      return candidate;
    }
  }
}
