# Legal Liability

Last updated: 2026-05-25

A high-level, issue-spotting map of insecur's legal exposure as a custodian of production
secrets, and the surprises worth knowing before they bite. Companion to
[security-plan.md](../security-plan.md) and [pricing-strategy.md](pricing-strategy.md).

**This is not legal advice.** It is engineering-side research to scope a conversation with a
qualified attorney, not a substitute for one. Nothing here is privileged. The goal is to hand
counsel a pre-digested list so you pay them to decide, not to discover your own system.

Working assumptions (confirmed 2026-05-25): US-only market, Delaware/US **LLC**, regulated
industries (health, finance, government) **excluded by contract**. Selling into the EU/UK,
operating without an entity, or taking regulated customers would each change this materially.

## Why this product sits in a high-liability category

insecur asks customers to hand over the keys to their production systems. Three things follow:

- **Concentrated, severe harm.** A failure does not leak one record; it can hand an attacker a
  customer's entire production estate. The downstream damage (their breach, their downtime, their
  customers) dwarfs your subscription revenue, so plaintiffs and their insurers will reach for you.
- **Security claims are the product.** The pitch is "trusted custodian," "no-reveal," "small
  blast radius." Marketing claims about security are legally load-bearing: if the system does not
  do what the homepage says, that is a deceptive-practices and misrepresentation problem, not just
  a missed feature.
- **You are a data processor for others.** You hold customer content (secrets) plus some personal
  data (account identities via WorkOS). That triggers contractual and statutory duties that scale
  with your customers' own obligations.

## The liability regimes that actually apply (US, LLC)

| Regime | What triggers it | Practical exposure |
|---|---|---|
| **Contract (ToS / MSA / DPA)** | Every paid customer | The primary battleground. Your limitation-of-liability, warranty disclaimer, and indemnity terms decide most of your real risk. |
| **Common-law negligence** | A breach attributable to unreasonable security | "Failure to use reasonable care" as a secrets custodian. Standard rises because security is your core service. |
| **FTC Act §5 + state UDAP** | A gap between security marketing and reality | Deceptive-practices liability for over-claiming. The FTC actively pursues security-marketing mismatches; states add their own consumer-protection hooks. |
| **State breach-notification laws** | Unauthorized access to "personal information" | All 50 states. Notice timelines and definitions vary. See the surprise below about whether secrets even count. |
| **CCPA / CPRA** | For-profit + thresholds ($25M rev, 100k consumers, or 50% rev from PI) | Likely below threshold early, but B2B contacts now count. Includes a private right of action for breaches of *unencrypted* PI ($100-$750 per consumer). |
| **HIPAA / GLBA / PCI / FedRAMP** | Regulated-industry customer data | Deliberately **out of scope** via the acceptable-use exclusion. Keep it that way; willful blindness undoes it. |

## Where the architecture cuts your exposure

The security design is genuinely protective, and some of it is a direct legal shield. Do not give
these away through sloppy implementation or marketing:

- **No plaintext on any durable surface** plus **full encryption** is the strongest single
  mitigation. It is also a near-complete defense to the CCPA breach private right of action, which
  only reaches *nonencrypted* personal information. Logging one plaintext secret forfeits that.
- **Free tier holds no production secrets.** This caps blast radius, support burden, and abuse
  exposure for the largest, least-vetted slice of users. Good liability hygiene; keep the fence.
- **No-reveal custody, tenant-bound keys, tamper-evident audit, crypto-erase on discard.** These
  let you argue "reasonable, above-market security" against a negligence claim, *if* they ship and
  the marketing matches what shipped.
- **Storage Security Gate** is your documented line between "safe for production secrets" and
  "not." Storing real customer secrets before that gate passes (e.g. in the disposable scaffold or
  First Value loop) is the clearest negligence trap in the build plan. The docs already say the
  current code is unsafe for valuable secrets; the liability rule is to never let a real production
  secret in early.

## Surprises to flag

These are the items most likely to be missed and most likely to hurt.

1. **The "no-reveal custodian" promise and ADR-0028 do not agree in V1.** ADR-0028 states plainly
   that Cloudflare Secrets Store has no per-secret binding ACL, so *any identity that can deploy a
   Worker in the account can bind the root key and read it at runtime*. "Deploy access cannot
   decrypt tenant data" is explicitly **not** a V1 guarantee. That means the company (you, any
   future contractor with deploy rights, or anyone who compromises the Cloudflare account) can
   technically decrypt all tenant data. Consequences:
   - You **cannot** truthfully market "zero-knowledge," "we can't see your secrets," or
     "technically incapable of access" in V1. Doing so is the textbook FTC §5 / UDAP deceptive-
     security claim, and it is exactly what plaintiffs cite to pierce the LLC for misrepresentation.
   - It also sets your **law-enforcement posture**: faced with a valid warrant, you are not
     technically unable to comply, so do not tell customers you are.
   - Fix path is already named in the ADR (external KMS once there are multiple Service Access
     operators). Until then, the marketing must say what the system actually does: strong
     encryption and no *casual* read path, not cryptographic inability.

2. **Encryption is a real shield against the CCPA private right of action.** This cuts in your
   favor and is worth protecting deliberately. The whole "no plaintext persistence" regime keeps
   you out of the one CCPA provision that lets consumers sue directly. Treat the canary-leak tests
   in the release gate as a legal control, not just an engineering one.

3. **A secrets-only breach may not trigger statutory breach notice, but do not lean on that.**
   Most state statutes define "personal information" as name plus SSN / financial / medical /
   biometric data. Raw API keys and DB passwords usually are not that. **But** several states
   (California among them) now cover account credentials that permit access to an online account,
   and your customer secrets are exactly that. Meanwhile your customer contracts will impose breach
   notice far stricter and faster than any statute. Net: the statutory gap is real but narrow, and
   contracts will override it. Have counsel confirm; do not design around the gap.

4. **"Tamper-evident" audit export is signed, but it is still not "tamper-proof."** Per ADR-0045,
   V1 now adds Ed25519 signing on top of the hash chain and HMACed manifest, so exports are
   independently verifiable by anyone holding the published public key. That is a real upgrade over
   HMAC alone, which only you could verify. But two limits remain. First, the signing key lives in
   Cloudflare Secrets Store next to the root key (ADR-0028), so deploy/account access can produce
   valid signatures; the export is therefore not non-repudiable against insecur itself until the key
   moves to hardened custody at the same KMS trigger as the root key. Second, signing detects
   tampering, it does not prevent it, so "tamper-proof," "immutable," and "court-admissible" remain
   claim/reality gaps. The honest phrasing is "tamper-evident and independently verifiable," and not
   more than that.

5. **The LLC does not shield your own acts.** The liability shield stops ordinary business-debt and
   contract claims from reaching your personal assets. It does **not** stop: your own negligence or
   gross negligence, fraud/misrepresentation (see surprise 1), personal guarantees, or piercing for
   commingling / undercapitalization / skipped formalities. As the solo operator who configures the
   system, "your own negligence caused the breach" is a live path to name you personally. Mitigate
   with insurance, accurate marketing, clean corporate formalities, and never personally
   guaranteeing customer obligations.

6. **Liability-cap carve-outs are where a secrets breach lands.** Enterprise customers will push to
   put data-breach and confidentiality outside the liability cap, and a secrets breach is precisely
   the catastrophic event that would blow past any cap. Negotiate either an aggregate cap that
   includes breach, or a bounded "super-cap" multiple. This is the clause that decides whether one
   bad day ends the company. **Cyber + tech E&O insurance is effectively mandatory** before the
   first paying customer, and customers will require proof of it contractually.

7. **Key custody is now a physical and insider obligation.** Offline root-key escrow removes the
   single-point-of-loss risk but creates a second copy of the master key that must be physically
   secured with out-of-band access logging. Lose both the store and the escrow and *all customer
   data is permanently unrecoverable* (the docs say so). That is an availability/data-loss liability:
   a customer locked out of their production secrets has a business-critical outage and a breach-of-
   contract claim. The ToS must disclaim consequential and availability damages and set honest
   recovery expectations.

8. **Back-to-back DPAs gate your enterprise sales.** You cannot sign a customer DPA until you have
   DPAs in place with each subprocessor and a published subprocessor list. The named subprocessors
   today are **Cloudflare** (compute, Secrets Store, R2, Queues, Durable Objects, KV, Logpush),
   **Neon** (Postgres metadata), **WorkOS** (auth and account PII), and **Axiom** (telemetry sink;
   Sentry only if PII/breadcrumb/local capture is disabled). All are US-available, so US-only
   residency is promisable for data at rest (Neon region is pinned; R2 location is selectable). Note
   that Cloudflare edge compute is global and transient; promise residency for durable stores, not
   for edge execution.

9. **Secret Sync extends the liability boundary into the customer's provider accounts.** Once a
   value is synced to Vercel, GitHub, or a Cloudflare Worker, a persistent copy lives in the
   customer's own provider store, which insecur overwrites without readback and may leave orphaned
   on delete. The contract must make clear the customer owns and is responsible for their provider
   accounts and the consequences of sync (overwrite, delete, orphaned copies), so a sync side effect
   is not your liability.

10. **Service Access is an insider path across all tenants.** Even with no Secret Reveal, an
    operator can see decrypted Sensitive Metadata after the gate. As you add operators this becomes
    a real insider-risk and confidentiality-obligation surface; the auditing and reason-coding in
    ADR-0019 are the controls, and operator confidentiality terms should be on paper.

## What the contracts need to carry

The architecture limits *technical* blast radius; contracts limit *legal* blast radius. The
minimum set for taking production secrets:

- **Terms of Service / MSA** with: limitation of liability and an aggregate cap; "AS IS" warranty
  disclaimer; exclusion of consequential, indirect, and availability/data-loss damages; clear
  customer responsibilities (they own their provider accounts and sync targets); an incident-notice
  commitment you can actually meet; IP ownership; and governing law in your home state.
- **Acceptable Use Policy** that prohibits regulated/high-risk data (PHI, cardholder data,
  government-classified) and states no BAA is offered. Make it clickwrap and enforce it; the
  exclusion only holds if you do not knowingly onboard the customers it forbids.
- **DPA + published subprocessor list**, back-to-back with your subprocessors, with a change-notice
  mechanism.
- **Privacy Policy** covering the account/identity PII you actually hold (via WorkOS) and any
  telemetry. Customer secrets are customer content you process, not data you collect for your own
  purposes; say so.
- **Insurance**: cyber liability + technology E&O, bound before the first paying customer.

Self-hosted instances shift most custody liability to the customer (they generate, load, and escrow
their own root key per ADR-0028). The hosted `insecur.cloud` instance is where your custodial
liability concentrates.

## Punch list for counsel

Done when each is true and recorded:

- [ ] A SaaS/security-experienced attorney is engaged and has this document.
- [ ] The "can the company decrypt customer data in V1?" answer (ADR-0028) is decided, written down,
      and the marketing copy is aligned to it (no zero-knowledge / cannot-access claims while deploy
      access can extract the root key).
- [ ] ToS/MSA, AUP, Privacy Policy, and DPA are drafted and reviewed.
- [ ] A subprocessor list is published and DPAs are in place with Cloudflare, Neon, WorkOS, and the
      telemetry sink.
- [ ] Cyber + tech E&O insurance is bound, at limits your target customers will accept.
- [ ] Counsel has confirmed state breach-notification applicability to a secrets-only and a
      credentials-included breach, and CCPA/CPRA threshold status (re-checked at revenue/headcount
      milestones).
- [ ] Limitation-of-liability cap and breach carve-out position is set and matches insurance limits.
- [ ] "Tamper-evident" and other security claims are reviewed against what the system actually
      proves.
