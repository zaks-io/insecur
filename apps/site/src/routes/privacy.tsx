import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, type LegalClause } from "../components/legal-page.js";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

const clauses: LegalClause[] = [
  {
    heading: "What we collect",
    body: (
      <>
        <p>
          The hosted insecur service is operated by Zaks.io, LLC (dba Zaks.io), a California company
          that maintains the open-source insecur code. This policy covers the data that service
          holds. We keep two kinds of it, and we keep them separate.
        </p>
        <ul className="ml-4 flex list-disc flex-col gap-1 marker:text-muted-foreground">
          <li>
            <strong className="text-foreground">Account data:</strong> your email, organization, the
            people and machine identities you add, and your settings. We use it to run your account
            and to sign you in.
          </li>
          <li>
            <strong className="text-foreground">Secrets you store:</strong> the values you put into
            custody. These are encrypted under a tenant-bound key. We store the ciphertext; we do
            not keep a plaintext copy at rest.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "How custody changes what we hold",
    body: (
      <>
        <p>
          insecur is built so the readable secret stays off the paths where it leaks. We show
          metadata only in the console: variable key, environment, version, byte length, and last
          used. For production-grade Protected Environment values, no plaintext read-back path
          through the product exists, by design.
        </p>
        <p>
          Development values are the weaker tier: the injected secret reaches the process your agent
          runs, so that process can read it. We are honest about that boundary rather than pretend
          it away.
        </p>
      </>
    ),
  },
  {
    heading: "Audit records",
    body: (
      <>
        <p>
          Custody means keeping a record. When a secret is set, rotated, delivered, or approved, we
          log which identity did it, which secret it touched, and when. Those records are the point
          of the product, so they persist even after a secret is deleted. They contain metadata, not
          secret values.
        </p>
      </>
    ),
  },
  {
    heading: "How we use it",
    body: (
      <>
        <p>
          We use your data to provide custody, sign you in, deliver secrets to the systems you
          authorize, keep the audit trail, and keep the service running and secure. We do not sell
          your data, and we do not use your stored secrets to train anything.
        </p>
      </>
    ),
  },
  {
    heading: "Who we share it with",
    body: (
      <>
        <p>
          We share data with the infrastructure providers that run insecur (for hosting,
          authentication, and error monitoring) and only as much as they need to do their part.
          Zaks.io is a California company and processes data in the United States. We do not serve
          customers who need non-US data residency.
        </p>
        <p>
          We use Cloudflare Turnstile to protect sign-in from automated abuse. Cloudflare's handling
          of data for Turnstile is described in its{" "}
          <a
            href="https://www.cloudflare.com/en-gb/turnstile-privacy-policy/"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Turnstile Privacy Addendum
          </a>
          .
        </p>
        <p>We disclose data to authorities only when the law requires it.</p>
      </>
    ),
  },
  {
    heading: "How we protect it",
    body: (
      <>
        <p>
          Secrets are encrypted under keys bound to your tenant, so a leak in one organization
          cannot decrypt another. When something goes wrong, it is meant to go wrong small.
        </p>
        <p>
          One caveat, stated plainly: insecur is pre-alpha software. The protections above describe
          the design we are building toward, and are not all in force or verified yet. See the{" "}
          <a href="/terms" className="font-semibold text-foreground underline underline-offset-4">
            terms of use
          </a>{" "}
          for what that means for the data you put in now.
        </p>
      </>
    ),
  },
  {
    heading: "How long we keep it",
    body: (
      <>
        <p>
          We keep account data while your account is active. Encrypted secrets stay until you delete
          them or rotate them out. Audit records are kept as long as we need them to preserve a
          trustworthy trail. During pre-alpha we may reset environments and drop stored data as we
          build.
        </p>
      </>
    ),
  },
  {
    heading: "Your choices",
    body: (
      <>
        <p>
          You can access, correct, export, or delete your account data. Email us and we will help.
          Deleting a secret removes its value from custody but leaves the audit record that it once
          existed, because a custody log you can erase is not a custody log.
        </p>
      </>
    ),
  },
  {
    heading: "Changes and contact",
    body: (
      <>
        <p>
          Because the product is still being built, this policy will change. When we make a material
          change we will update the version and date at the top of this page. Questions, requests,
          or concerns:{" "}
          <a
            href="mailto:privacy@insecur.cloud"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            privacy@insecur.cloud
          </a>
          .
        </p>
      </>
    ),
  },
];

export function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal · Privacy policy"
      title="Privacy policy"
      summary="What insecur collects, why, and how custody changes the answer. We hold ciphertext and audit metadata, not a plaintext copy of your secrets."
      updated="July 9, 2026"
      version="pre-alpha · rev 1"
      contactEmail="privacy@insecur.cloud"
      clauses={clauses}
    />
  );
}
