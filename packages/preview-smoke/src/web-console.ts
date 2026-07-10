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
const SCRIPT_OPEN_TAG = /<script\b[^>]*>/giu;
const SCRIPT_SRC_ATTR = /\ssrc\s*=/iu;
const SCRIPT_NONCE_ATTR = /\snonce=["']([^"']*)["']/iu;

/**
 * The nonce CSP allows no `style` attribute, so server-rendered markup must not carry any. This
 * runs against the raw SSR response body, never the serialized live DOM: Cloudflare's zone-level
 * challenge platform (JS detections) injects an inline script that appends a transient hidden
 * iframe with inline styles to <body> until DOMContentLoaded, so a DOM snapshot taken at
 * `domcontentloaded` flags edge-injected markup the app does not ship (INS-591).
 */
export function assertSsrHtmlHasNoInlineStyle(ssrHtml: string, label: string): void {
  if (INLINE_STYLE_ATTR.test(ssrHtml)) {
    throw new Error(`${label} server-rendered HTML carries an inline style attribute`);
  }
}

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

export async function assertAuthedConsolePage(input: AuthedConsolePageInput): Promise<void> {
  const expectation = input.expectation ?? {};
  assertNoLoginRedirect(input.pageUrl, input.label);
  assertStatus(input.response, 200, input.label, { bodyText: input.html });
  const pageResponse = requireResponse(input.response, input.label);

  if (expectation.privateDocument ?? true) {
    assertPrivateAuthedDocument(pageResponse, input.label);
  }
  const ssrHtml = await pageResponse.text();
  assertCspNonceMatchesScripts(pageResponse, ssrHtml, input.label);
  assertSsrHtmlHasNoInlineStyle(ssrHtml, input.label);

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

/**
 * Runs against the raw SSR response body, never the live DOM: Cloudflare's zone-level challenge
 * platform intermittently injects an inline script without our nonce at the edge, so a DOM-based
 * check flags markup the app does not ship. Third-party runtime injection is outside the app's
 * CSP posture and the browser enforces the nonce at runtime anyway (INS-602).
 */
function assertCspNonceMatchesScripts(
  response: PageResponse,
  ssrHtml: string,
  label: string,
): void {
  assertHeaderContains(response, "content-security-policy", "default-src", label);
  const csp = headerValue(response, "content-security-policy") ?? "";
  const nonceMatch = /'nonce-([^']+)'/u.exec(csp);
  if (nonceMatch === null) {
    throw new Error(`${label} CSP missing nonce directive`);
  }
  const nonce = nonceMatch[1] ?? "";
  const inlineScriptTags = Array.from(
    ssrHtml.matchAll(SCRIPT_OPEN_TAG),
    (match) => match[0],
  ).filter((tag) => !SCRIPT_SRC_ATTR.test(tag));
  const mismatched = inlineScriptTags.filter(
    (tag) => SCRIPT_NONCE_ATTR.exec(tag)?.[1] !== nonce,
  ).length;
  if (inlineScriptTags.length === 0) {
    throw new Error(`${label} rendered no inline scripts to validate against the CSP nonce`);
  }
  if (mismatched > 0) {
    throw new Error(`${label} inline scripts missing matching nonce attribute`);
  }
}

function headerValue(response: PageResponse, name: string): string | null {
  return response.headers()[name.toLowerCase()] ?? null;
}
