import { WORKOS_SESSION_COOKIE } from "@insecur/auth";

export const SSR_TEST_ORIGIN = "https://insecur.test";

export interface SsrRequestOptions {
  readonly method?: string;
  /** Sealed WorkOS session value; sent as the `wos-session` cookie. */
  readonly sessionCookie?: string;
  /** Bearer credential (preview smoke path); sent as the `Authorization` header. */
  readonly bearer?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: BodyInit;
}

/**
 * Build the `Request` an SSR route sees, with optional fake session cookie and/or bearer
 * credential. Console slices drive their server seams (actor resolution, guards, BFF reads)
 * with this instead of hand-rolling headers.
 */
export function ssrRequest(path: string, options: SsrRequestOptions = {}): Request {
  const headers = new Headers(options.headers);
  if (options.sessionCookie !== undefined) {
    const existing = headers.get("Cookie");
    const sessionPair = `${WORKOS_SESSION_COOKIE}=${options.sessionCookie}`;
    headers.set("Cookie", existing === null ? sessionPair : `${existing}; ${sessionPair}`);
  }
  if (options.bearer !== undefined) {
    headers.set("Authorization", `Bearer ${options.bearer}`);
  }
  return new Request(`${SSR_TEST_ORIGIN}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: options.body }),
  });
}
