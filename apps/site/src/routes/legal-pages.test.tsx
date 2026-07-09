import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PrivacyPage } from "./privacy.js";
import { SecurityPage } from "./security.js";
import { TermsPage } from "./terms.js";

// These guard that the three long-form public pages render without throwing (catches broken
// imports/JSX/route wiring) and that the two load-bearing claims survive edits: Terms warns this is
// pre-alpha and will change, and the security page states the honest boundary rather than a
// zero-knowledge overclaim. They deliberately do not police individual copy words — the prose is
// expected to churn.

describe("public legal + posture pages", () => {
  it("renders the terms page with its pre-alpha warning", () => {
    const markup = renderToStaticMarkup(<TermsPage />);
    expect(markup).toContain("Terms of use");
    expect(markup).toContain("pre-alpha");
    expect(markup).toContain("will change");
  });

  it("renders the privacy page", () => {
    const markup = renderToStaticMarkup(<PrivacyPage />);
    expect(markup).toContain("Privacy policy");
  });

  it("renders the security page stating the honest claim boundary", () => {
    const markup = renderToStaticMarkup(<SecurityPage />);
    // The claim ceiling: no-reveal read-back for production, not a zero-knowledge promise.
    expect(markup).toContain("read-back");
    expect(markup).toContain("zero-knowledge");
  });
});
