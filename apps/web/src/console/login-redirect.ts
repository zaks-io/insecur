/**
 * The `/login?returnTo=…` href console guards redirect unauthenticated visitors to. Loaders throw
 * `redirect({ href: loginRedirectHref(...) })` so the guard runs identically on SSR document
 * requests and client-side navigations.
 */
export function loginRedirectHref(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}
