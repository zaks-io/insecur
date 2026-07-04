import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@insecur/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>insecur web BFF</CardTitle>
          <CardDescription>Tenant console scaffold for the browser-facing Worker.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 leading-relaxed">
          <p>
            The browser talks only to this Worker. API bearer tokens stay server-side on the private
            Service Binding hop to <code>insecur-api</code>.
          </p>
          <p>
            Open{" "}
            <a href="/whoami" className="font-semibold underline underline-offset-4">
              /whoami
            </a>{" "}
            with a valid WorkOS session cookie to exercise the BFF to API path end to end.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
