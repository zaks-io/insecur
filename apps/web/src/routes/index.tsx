import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@insecur/ui";
import { createFileRoute } from "@tanstack/react-router";
import { SiteFrame } from "../components/site-frame.js";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <SiteFrame
      nav={
        <Button asChild variant="outline" size="sm">
          <a href="/login">Sign in</a>
        </Button>
      }
    >
      <section className="px-5 py-10 sm:px-8 sm:py-12">
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>insecur web console</CardTitle>
            <CardDescription>The browser-facing surface of your secrets custody.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 leading-relaxed">
            <p>
              The browser talks only to this Worker. API bearer tokens stay server-side on the
              private Service Binding hop to <code>insecur-api</code>.
            </p>
            <p>
              <a href="/orgs" className="font-semibold underline underline-offset-4">
                Go to your console
              </a>{" "}
              to browse organizations, projects, and audit metadata. Secret values never render
              here.
            </p>
          </CardContent>
        </Card>
      </section>
    </SiteFrame>
  );
}
