import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoginPrivacyNotice } from "./login-privacy-notice.js";

describe("LoginPrivacyNotice", () => {
  it("links the Turnstile login surface to the public privacy policy", () => {
    const markup = renderToStaticMarkup(<LoginPrivacyNotice />);

    expect(markup).toContain("Cloudflare Turnstile");
    expect(markup).toContain('href="https://insecur.cloud/privacy"');
  });
});
