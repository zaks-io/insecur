import { createFileRoute } from "@tanstack/react-router";
import { ConsoleSectionPlaceholderPage } from "../components/console-section-placeholder-page.js";

export const Route = createFileRoute("/orgs/$orgId/people")({
  component: PeoplePage,
});

function PeoplePage() {
  return (
    <ConsoleSectionPlaceholderPage title="People">
      Members, teams, and invitations land here.
    </ConsoleSectionPlaceholderPage>
  );
}
