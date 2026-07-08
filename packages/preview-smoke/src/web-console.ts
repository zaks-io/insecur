import type { Page, Response as PageResponse } from "@playwright/test";

import { authHeaders } from "./auth";
import {
  assertHeaderContains,
  assertHeaderEquals,
  assertStatus,
  assertTextIncludes,
  requireResponse,
} from "./http";

const INLINE_STYLE_ATTR = /<[a-z][^>]*\sstyle=["']/iu;

interface AuthedConsolePageExpectation {
  /** When true, the page must render the console shell instead of the public site frame. */
  readonly consoleShell?: boolean;
  readonly expectedText?: readonly string[];
  /** When true, assert Cache-Control: private, no-store and Vary: Cookie. */
  readonly privateDocument?: boolean;
}

interface AuthedConsolePageInput {
  readonly expectation?: AuthedConsolePageExpectation;
  readonly html: string;
  readonly label: string;
  readonly pageUrl: string;
  readonly response: PageResponse | null;
}

/** Attach the preview smoke bearer for subsequent navigations on this page. */
export async function useSmokeBearer(page: Page, bearer: string): Promise<void> {
  await page.setExtraHTTPHeaders(authHeaders(bearer));
}

/** Visit a Web BFF path with the smoke bearer and return the navigation response. */
export async function gotoAuthedWebPage(
  page: Page,
  webBaseUrl: string,
  path: string,
): Promise<PageResponse | null> {
  return page.goto(`${webBaseUrl}${path}`, { waitUntil: "domcontentloaded" });
}

function assertNoLoginRedirect(pageUrl: string, label: string): void {
  if (pageUrl.includes("/login")) {
    throw new Error(`${label} unexpectedly redirected to login: ${pageUrl}`);
  }
}

function assertConsoleShell(html: string, label: string): void {
  if (!html.includes('data-slot="console-shell"')) {
    throw new Error(`${label} did not render the authenticated console shell`);
  }
}

export function assertAuthedConsolePage(input: AuthedConsolePageInput): void {
  const expectation = input.expectation ?? {};
  assertNoLoginRedirect(input.pageUrl, input.label);
  assertStatus(input.response, 200, input.label, { bodyText: input.html });
  const pageResponse = requireResponse(input.response, input.label);

  if (expectation.privateDocument ?? true) {
    assertPrivateAuthedDocument(pageResponse, input.label);
  }
  assertCspNonceMatchesHtml(pageResponse, input.html, input.label);

  if (expectation.consoleShell === true) {
    assertConsoleShell(input.html, input.label);
  }

  for (const needle of expectation.expectedText ?? []) {
    assertTextIncludes(input.html, needle, input.label);
  }
}

export function assertHtmlFreeOfSensitiveMaterial(
  html: string,
  label: string,
  patterns: readonly string[],
): void {
  let redacted = html;
  for (const pattern of patterns) {
    if (pattern === "") {
      continue;
    }
    redacted = redacted.split(pattern).join("[redacted]");
  }
  if (redacted.includes("[redacted]")) {
    throw new Error(`${label} HTML leaked a sensitive value`);
  }
}

function assertPrivateAuthedDocument(response: PageResponse, label: string): void {
  assertHeaderEquals(response, "cache-control", "private, no-store", label);
  assertHeaderEquals(response, "vary", "Cookie", label);
}

function assertCspNonceMatchesHtml(response: PageResponse, html: string, label: string): void {
  assertHeaderContains(response, "content-security-policy", "default-src", label);
  const csp = headerValue(response, "content-security-policy") ?? "";
  const nonceMatch = /'nonce-([^']+)'/u.exec(csp);
  if (nonceMatch === null) {
    throw new Error(`${label} CSP missing nonce directive`);
  }
  const nonce = nonceMatch[1] ?? "";
  if (!html.includes(`nonce="${nonce}"`) && !html.includes(`nonce='${nonce}'`)) {
    throw new Error(`${label} inline scripts missing matching nonce attribute`);
  }
  if (INLINE_STYLE_ATTR.test(html)) {
    throw new Error(`${label} server-rendered HTML carries an inline style attribute`);
  }
}

function headerValue(response: PageResponse, name: string): string | null {
  return response.headers()[name.toLowerCase()] ?? null;
}
