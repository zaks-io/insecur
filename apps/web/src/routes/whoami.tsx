import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@insecur/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { SiteFrame } from "../components/site-frame.js";
import { loginRedirectHref } from "../console/login-redirect.js";
import { loadWhoamiProof } from "../server/whoami";

export const Route = createFileRoute("/whoami")({
  loader: async () => {
    const proof = await loadWhoamiProof();
    if (!proof.authenticated) {
      throw redirect({ href: loginRedirectHref("/whoami") });
    }
    return proof;
  },
  component: WhoamiPage,
});

function WhoamiPage() {
  const proof = Route.useLoaderData();

  return (
    <SiteFrame>
      <section className="px-5 py-10 sm:px-8 sm:py-12">
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Session proof</CardTitle>
            <CardDescription>
              Rendered by the BFF after a private Service Binding call to{" "}
              <code>/v1/session/whoami</code> on <code>insecur-api</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p>No API bearer token reached the browser.</p>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2">
              <dt className="font-semibold">Actor type</dt>
              <dd>{proof.actorType}</dd>
              <dt className="font-semibold">User ID</dt>
              <dd>
                <code>{proof.userId}</code>
              </dd>
              <dt className="font-semibold">Session ID</dt>
              <dd>
                <code>{proof.sessionId}</code>
              </dd>
            </dl>
          </CardContent>
        </Card>
      </section>
    </SiteFrame>
  );
}
