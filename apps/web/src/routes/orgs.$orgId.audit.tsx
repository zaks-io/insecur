import { createFileRoute } from "@tanstack/react-router";
import { ConsoleSectionPlaceholderPage } from "../components/console-section-placeholder-page.js";

export const Route = createFileRoute("/orgs/$orgId/audit")({
  component: AuditPage,
});

function AuditPage() {
  return (
    <ConsoleSectionPlaceholderPage title="Audit">
      The filterable metadata event log lands here: every actor, action, and target. Secret values
      never render in this console.
    </ConsoleSectionPlaceholderPage>
  );
}
