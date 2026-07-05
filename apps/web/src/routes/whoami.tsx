import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@insecur/ui";
import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { resolveBrowserActor } from "../auth/resolve-browser-actor.js";
import { unauthenticatedWhoamiRedirect } from "../auth/whoami-auth-gate.js";
import type { WebEnv } from "../env.js";
import { loadWhoamiProof, type WhoamiProof } from "../server/whoami";

function authenticatedWhoamiProof(
  proof: WhoamiProof,
): Extract<WhoamiProof, { authenticated: true }> {
  if (!proof.authenticated) {
    throw new Error("Whoami loader executed without server auth gate");
  }
  return proof;
}

export const Route = createFileRoute("/whoami")({
  server: {
    handlers: {
      GET: async () => {
        const request = getRequest();
        const resolved = await resolveBrowserActor(request, env as WebEnv);
        const redirect = unauthenticatedWhoamiRedirect(resolved);
        if (redirect !== null) {
          return redirect;
        }
      },
    },
  },
  loader: async () => authenticatedWhoamiProof(await loadWhoamiProof()),
  component: WhoamiPage,
});

function WhoamiPage() {
  const proof = Route.useLoaderData();

  return (
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
  );
}
