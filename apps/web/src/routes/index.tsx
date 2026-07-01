import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <section className="panel">
      <h1>insecur web BFF</h1>
      <p>
        The browser talks only to this Worker. API bearer tokens stay server-side on the private
        Service Binding hop to <code>insecur-api</code>.
      </p>
      <p>
        Open <a href="/whoami">/whoami</a> with a valid WorkOS session cookie to exercise the BFF to
        API path end to end.
      </p>
    </section>
  );
}
