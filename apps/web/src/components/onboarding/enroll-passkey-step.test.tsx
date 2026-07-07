import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EnrollPasskeyStep } from "./enroll-passkey-step.js";

describe("EnrollPasskeyStep", () => {
  it("lets members skip enrollment and continue the wizard", () => {
    const html = renderToStaticMarkup(
      <EnrollPasskeyStep returnTo="/onboarding" enrollmentError={false} onSkip={vi.fn()} />,
    );
    expect(html).toContain("Skip for now");
    expect(html).toContain("/auth/enroll-passkey?returnTo=%2Fonboarding");
  });
});
