import { createFileRoute } from "@tanstack/react-router";
import { Button, Hero } from "@insecur/ui";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <Hero
      eyebrow="Diskless development secrets"
      title="Secrets your agents can use but never see."
      lede="insecur is no-reveal secrets custody for teams shipping with agents and CI. This is an early placeholder landing page; the First Value Proof walkthrough lands next."
      actions={
        <Button disabled title="Coming soon">
          Try the First Value Proof
        </Button>
      }
    />
  );
}
