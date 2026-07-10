import type { Page, Response as PageResponse } from "@playwright/test";
import { describe, expect, it } from "vitest";

import {
  assertAuthedConsolePage,
  assertSsrHtmlHasNoInlineStyle,
  useSmokeBearer,
} from "../src/web-console";

describe("useSmokeBearer", () => {
  it("applies the bearer without enabling trace capture", async () => {
    const calls: string[] = [];
    const page = {
      setExtraHTTPHeaders: (headers: Record<string, string>) => {
        const authorization = headers.Authorization;
        if (authorization === undefined) {
          throw new Error("Expected Authorization header");
        }
        calls.push(`headers:${authorization}`);
        return Promise.resolve();
      },
    } as unknown as Page;

    await useSmokeBearer(page, "fake-preview-smoke-bearer");

    expect(calls).toEqual(["headers:Bearer fake-preview-smoke-bearer"]);
  });
});

// The transient hidden iframe Cloudflare's zone-level challenge platform (JS detections) appends
// to <body> until DOMContentLoaded. It exists only in the live DOM, never in the SSR body, and
// must not fail the inline-style guard (INS-591).
const CF_CHALLENGE_IFRAME =
  '<iframe height="1" width="1" style="position: absolute; top: 0px; left: 0px; visibility: hidden;"></iframe>';

// The inline script the challenge platform intermittently injects at the edge. It never carries
// the app's CSP nonce and must not fail the nonce guard when absent from the SSR body (INS-602).
const CF_CHALLENGE_SCRIPT = "<script>(function(){window._cf_chl_opt={};})();</script>";

const CLEAN_SSR_HTML =
  '<!DOCTYPE html><html lang="en"><head><script nonce="abc"></script>' +
  '<script src="/app.js"></script></head>' +
  '<body><div data-slot="console-shell" class="style" data-style="x">ok</div></body></html>';

function stubResponse(ssrHtml: string): PageResponse {
  return {
    status: () => 200,
    text: () => Promise.resolve(ssrHtml),
    headers: () => ({
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'self'; script-src 'nonce-abc'; style-src 'self'",
      vary: "Cookie",
    }),
  } as unknown as PageResponse;
}

describe("assertSsrHtmlHasNoInlineStyle", () => {
  it.each([
    ['<div style="color:red">', "double-quoted"],
    ["<div style='color:red'>", "single-quoted"],
    ['<span  style="x">', "extra whitespace"],
  ])("flags %s (%s)", (html) => {
    expect(() => {
      assertSsrHtmlHasNoInlineStyle(html, "label");
    }).toThrow("server-rendered HTML carries an inline style attribute");
  });

  it.each([
    ['<div class="style">', "class named style"],
    ['<div data-style="x">', "data attribute"],
    ["<div>styled</div>", "bare word"],
  ])("passes %s (%s)", (html) => {
    expect(() => {
      assertSsrHtmlHasNoInlineStyle(html, "label");
    }).not.toThrow();
  });
});

describe("assertAuthedConsolePage inline-style guard", () => {
  it("checks the SSR response body, so edge-injected DOM styles cannot fail it", async () => {
    const hydratedDom = CLEAN_SSR_HTML.replace("</body>", `${CF_CHALLENGE_IFRAME}</body>`);
    await expect(
      assertAuthedConsolePage({
        response: stubResponse(CLEAN_SSR_HTML),
        pageUrl: "https://app.example/orgs/org_x",
        html: hydratedDom,
        label: "stub page",
        expectation: { consoleShell: true },
      }),
    ).resolves.toBeUndefined();
  });

  it("still fails when the SSR body itself carries an inline style attribute", async () => {
    const dirtySsr = CLEAN_SSR_HTML.replace("ok", '<p style="color:red">ok</p>');
    await expect(
      assertAuthedConsolePage({
        response: stubResponse(dirtySsr),
        pageUrl: "https://app.example/orgs/org_x",
        html: dirtySsr,
        label: "stub page",
        expectation: { consoleShell: true },
      }),
    ).rejects.toThrow("server-rendered HTML carries an inline style attribute");
  });
});

describe("assertAuthedConsolePage CSP nonce guard", () => {
  it("checks the SSR response body, so an edge-injected non-nonce DOM script cannot fail it", async () => {
    const hydratedDom = CLEAN_SSR_HTML.replace("</body>", `${CF_CHALLENGE_SCRIPT}</body>`);
    await expect(
      assertAuthedConsolePage({
        response: stubResponse(CLEAN_SSR_HTML),
        pageUrl: "https://app.example/orgs/org_x",
        html: hydratedDom,
        label: "stub page",
        expectation: { consoleShell: true },
      }),
    ).resolves.toBeUndefined();
  });

  it("still fails when the SSR body carries an inline script without the matching nonce", async () => {
    const dirtySsr = CLEAN_SSR_HTML.replace("</body>", `${CF_CHALLENGE_SCRIPT}</body>`);
    await expect(
      assertAuthedConsolePage({
        response: stubResponse(dirtySsr),
        pageUrl: "https://app.example/orgs/org_x",
        html: dirtySsr,
        label: "stub page",
        expectation: { consoleShell: true },
      }),
    ).rejects.toThrow("inline scripts missing matching nonce attribute");
  });

  it("fails when the SSR body carries an inline script with a wrong nonce", async () => {
    const dirtySsr = CLEAN_SSR_HTML.replace('nonce="abc"', 'nonce="wrong"');
    await expect(
      assertAuthedConsolePage({
        response: stubResponse(dirtySsr),
        pageUrl: "https://app.example/orgs/org_x",
        html: dirtySsr,
        label: "stub page",
        expectation: { consoleShell: true },
      }),
    ).rejects.toThrow("inline scripts missing matching nonce attribute");
  });

  it("fails when the SSR body renders no inline scripts to validate", async () => {
    const scriptlessSsr = CLEAN_SSR_HTML.replace('<script nonce="abc"></script>', "");
    await expect(
      assertAuthedConsolePage({
        response: stubResponse(scriptlessSsr),
        pageUrl: "https://app.example/orgs/org_x",
        html: scriptlessSsr,
        label: "stub page",
        expectation: { consoleShell: true },
      }),
    ).rejects.toThrow("rendered no inline scripts to validate against the CSP nonce");
  });
});
