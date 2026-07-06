import { ConsolePlaceholder } from "@insecur/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/orgs/$orgId/projects/$projectId/delivery")({
  component: ProjectDeliveryPage,
});

/** Placeholder: the Delivery sub-page is deliberately undesigned (docs/web-console-ux.md). */
function ProjectDeliveryPage() {
  return (
    <div className="mt-8">
      <ConsolePlaceholder title="Delivery" className="max-w-2xl">
        Delivery configuration and the approval evidence it feeds land here once that surface is
        designed.
      </ConsolePlaceholder>
    </div>
  );
}
