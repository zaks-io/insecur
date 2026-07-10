import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LOGOUT_CSRF_FIELD, LOGOUT_PATH } from "../auth/logout-contract.js";
import { ConsoleFrame } from "./console-frame.js";
import { OnboardingFrame } from "./onboarding/onboarding-frame.js";
import { SignOutButton } from "./sign-out-button.js";

const ORG_ID = "org_01JZ8E2QYQAAAAAAAAAAAAAAAA";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <a href="/mocked">{children}</a>,
  useLocation: () => ({ pathname: `/orgs/${ORG_ID}` }),
  useMatch: () => undefined,
}));

/**
 * A plain HTML form cannot send the `x-insecur-csrf` header, so the visible sign-out controls
 * must carry the double-submit token in a hidden field the /logout route reads from the form body
 * (INS-582). This markup contract is what keeps both rendered logout controls from 403ing.
 */
function expectCsrfLogoutForm(html: string): void {
  expect(html).toContain(`action="${LOGOUT_PATH}"`);
  expect(html).toContain('method="post"');
  expect(html).toContain(`name="${LOGOUT_CSRF_FIELD}"`);
  expect(html).toContain("Sign out");
}

describe("SignOutButton", () => {
  it("renders a /logout form carrying the hidden CSRF field", () => {
    expectCsrfLogoutForm(renderToStaticMarkup(<SignOutButton />));
  });
});

describe("visible logout controls", () => {
  it("the console frame sign-out control submits the CSRF field to /logout", () => {
    const props: ComponentProps<typeof ConsoleFrame> = {
      organizations: [{ organizationId: ORG_ID, displayName: "Acme" }],
      activeOrg: { organizationId: ORG_ID, displayName: "Acme" },
      passkeyEnrolled: true,
      children: null,
    };
    expectCsrfLogoutForm(renderToStaticMarkup(<ConsoleFrame {...props} />));
  });

  it("the onboarding frame sign-out control submits the CSRF field to /logout", () => {
    expectCsrfLogoutForm(
      renderToStaticMarkup(
        <OnboardingFrame currentStep="name-organization">{null}</OnboardingFrame>,
      ),
    );
  });
});
