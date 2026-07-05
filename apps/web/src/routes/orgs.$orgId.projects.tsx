import { createFileRoute } from "@tanstack/react-router";
import { ConsoleSectionPlaceholderPage } from "../components/console-section-placeholder-page.js";

export const Route = createFileRoute("/orgs/$orgId/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  return (
    <ConsoleSectionPlaceholderPage title="Projects">
      The project list lands here. Each project gets Environments, a Secrets matrix, Access, and
      Delivery views.
    </ConsoleSectionPlaceholderPage>
  );
}
