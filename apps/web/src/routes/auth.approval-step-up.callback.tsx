import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import {
  approvalStepUpClearCookieHeader,
  completeBrowserApprovalStepUp,
  resolveApprovalStepUpFailureRedirect,
} from "../auth/browser-approval-step-up.js";
import { redirectResponse } from "../auth/browser-oauth.js";
import { SiteFrame } from "../components/site-frame.js";

export const Route = createFileRoute("/auth/approval-step-up/callback")({
  server: {
    handlers: {
      GET: async () => {
        const request = getRequest();
        const completed = await completeBrowserApprovalStepUp(request);
        if (!completed.ok) {
          return redirectResponse(resolveApprovalStepUpFailureRedirect(request), [
            approvalStepUpClearCookieHeader(),
          ]);
        }
        return redirectResponse(completed.redirectTo, [approvalStepUpClearCookieHeader()]);
      },
    },
  },
  component: ApprovalStepUpCallbackPage,
});

function ApprovalStepUpCallbackPage() {
  return (
    <SiteFrame>
      <section className="px-5 py-10 sm:px-8 sm:py-12">
        <p>Completing approval step-up…</p>
      </section>
    </SiteFrame>
  );
}
