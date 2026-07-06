import { createFileRoute } from "@tanstack/react-router";
import { ConsoleSectionPlaceholderPage } from "../components/console-section-placeholder-page.js";

export const Route = createFileRoute("/orgs/$orgId/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <ConsoleSectionPlaceholderPage title="Settings">
      Organization configuration and policies land here.
    </ConsoleSectionPlaceholderPage>
  );
}
