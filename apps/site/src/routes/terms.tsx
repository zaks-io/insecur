import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, StatusStamp, type LegalClause } from "../components/legal-page.js";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

const clauses: LegalClause[] = [
  {
    heading: "Who this agreement is between",
    body: (
      <>
        <p>
          These terms are between you (the person or team using insecur) and{" "}
          <strong className="text-foreground">Zaks.io, LLC</strong> (dba Zaks.io), a California
          limited liability company that operates the hosted insecur service. Using insecur means
          you accept them. If you are setting this up for a company, you are saying you can agree on
          its behalf.
        </p>
      </>
    ),
  },
  {
    heading: "Hosted service and open source",
    body: (
      <>
        <p>
          insecur is open-source software maintained by Zaks.io. These terms cover the{" "}
          <strong className="text-foreground">hosted service Zaks.io operates</strong>: the console,
          CLI, and API you reach through us. The source code is available separately under its own
          open-source license.
        </p>
        <p>
          Running the code yourself is governed by that license, not by these terms. When you use
          the version we host, these terms apply and Zaks.io is the operator responsible for it.
        </p>
      </>
    ),
  },
  {
    heading: "What insecur does",
    body: (
      <>
        <p>
          insecur is secrets custody. Your code and your agents ask for a secret, we set the value
          and hand back a working key, and the raw value stays off the paths where it usually leaks.
          The console shows metadata only: variable key, environment, version, byte length, and when
          it was last used. Secret values are never rendered back to you.
        </p>
        <p>
          For development values, the injected secret reaches the process your agent controls, so
          that agent can read it. We do not claim otherwise. The protection is a small, recoverable
          blast radius, not unreadability.
        </p>
      </>
    ),
  },
  {
    heading: "This is not a production release yet",
    body: (
      <>
        <p>
          Pre-alpha means the software is incomplete and unverified for real use. Treat it as a
          preview you are looking at, not a system you are trusting. Do not store a secret in
          insecur that you cannot afford to lose, rotate, or expose while we are still building.
        </p>
        <p>
          There is no uptime commitment, no support commitment, and no backup or recovery guarantee
          during pre-alpha. We may reset environments, drop stored data, or change how custody works
          without notice.
        </p>
      </>
    ),
  },
  {
    heading: "Your account and your secrets",
    body: (
      <>
        <p>
          You are responsible for who you let into your organization and for the machine identities
          you create. Keep your sign-in and your deploy keys to the people and systems that need
          them. Tell us fast if you think an account or key has been taken.
        </p>
        <p>
          You keep ownership of the secrets and data you put into insecur. You give us only the
          permission we need to store, encrypt, and deliver them so the product can do its job.
        </p>
      </>
    ),
  },
  {
    heading: "Acceptable use",
    body: (
      <>
        <p>Use insecur for lawful work with secrets that are yours to hold. Do not:</p>
        <ul className="ml-4 flex list-disc flex-col gap-1 marker:text-muted-foreground">
          <li>break, probe, or overload the service, or try to reach data that is not yours;</li>
          <li>resell or rebrand insecur as your own product;</li>
          <li>upload material you have no right to store.</li>
        </ul>
        <p>
          We are US-only and do not serve regulated industries or customers needing non-US data
          residency. That stays true until we say otherwise in writing.
        </p>
      </>
    ),
  },
  {
    heading: "No warranty",
    body: (
      <>
        <p>
          insecur is provided as is, without warranties of any kind. We do not promise it is
          error-free, uninterrupted, or fit for a particular purpose. Given the pre-alpha stage,
          assume it is not. You use it at your own risk.
        </p>
      </>
    ),
  },
  {
    heading: "Limit of liability",
    body: (
      <>
        <p>
          To the extent the law allows, Zaks.io, LLC is not liable for indirect, incidental, or
          consequential damages, or for lost data, revenue, or profit. This matters more than usual
          right now: the software is pre-alpha and not built to protect anything you value yet.
        </p>
      </>
    ),
  },
  {
    heading: "Ending your use",
    body: (
      <>
        <p>
          You can stop using insecur at any time. We may suspend or end access during pre-alpha,
          including to reset the environment, and we will try to give notice when we can. On
          termination, your right to use the service ends and we may delete associated data.
        </p>
      </>
    ),
  },
  {
    heading: "Changes to these terms",
    body: (
      <>
        <p>
          Because the product is still being built, these terms will change. When we make a material
          change we will update the version and date at the top of this page. Continuing to use
          insecur after a change means you accept the new terms.
        </p>
      </>
    ),
  },
  {
    heading: "Governing law and contact",
    body: (
      <>
        <p>
          These terms are governed by the laws of the State of California, without regard to
          conflict-of-law rules. Zaks.io, LLC is based in California. Reach us at{" "}
          <a
            href="mailto:legal@insecur.cloud"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            legal@insecur.cloud
          </a>
          .
        </p>
      </>
    ),
  },
];

export function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal · Terms of use"
      title="Terms of use"
      summary="The rules for using insecur while we build it. Short, plain, and honest about the stage the software is actually at."
      updated="July 9, 2026"
      version="pre-alpha · rev 1"
      banner={
        <StatusStamp label="Read this first · pre-alpha">
          <p>
            insecur is pre-alpha, in-development software. It is not finished, not hardened, and not
            a production service. Things <strong className="text-signal">will change</strong>, and
            some of it will change without warning.
          </p>
          <p>
            We may reset environments and drop stored data while we build. Do not put a secret here
            that you would be sorry to lose or to have exposed. The no-reveal guarantees we are
            building toward are not in force yet.
          </p>
        </StatusStamp>
      }
      clauses={clauses}
    />
  );
}
