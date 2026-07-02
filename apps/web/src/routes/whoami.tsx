import { createFileRoute } from "@tanstack/react-router";
import { loadWhoamiProof } from "../server/whoami";

export const Route = createFileRoute("/whoami")({
  loader: () => loadWhoamiProof(),
  component: WhoamiPage,
});

function WhoamiPage() {
  const proof = Route.useLoaderData();

  if (!proof.authenticated) {
    return (
      <section className="panel">
        <h1>Session proof</h1>
        <p>
          No admitted browser session was found. Sign in through WorkOS to exercise the BFF hop.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h1>Session proof</h1>
      <p>
        This page was rendered by the BFF after a private Service Binding call to{" "}
        <code>/v1/session/whoami</code> on <code>insecur-api</code>. No API bearer token reached the
        browser.
      </p>
      <dl className="proof-grid">
        <dt>Actor type</dt>
        <dd>{proof.actorType}</dd>
        <dt>User ID</dt>
        <dd>
          <code>{proof.userId}</code>
        </dd>
        <dt>Session ID</dt>
        <dd>
          <code>{proof.sessionId}</code>
        </dd>
      </dl>
    </section>
  );
}
