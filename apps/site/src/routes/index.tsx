import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@insecur/ui";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <Hero
      eyebrow="Coming soon"
      title="Secrets your agents can use but never see."
      lede="insecur is no-reveal secrets custody for teams shipping with agents and CI. We're building it now — check back soon."
    />
  );
}
