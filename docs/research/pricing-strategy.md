# Pricing Strategy

Last updated: 2026-05-25

A proposed pricing model for insecur and the reasoning behind it. Companion to
[competitive-landscape.md](competitive-landscape.md). Dollar amounts are working assumptions;
the structure is the argument.

## Positioning: premium, trustworthy, not cheap

The product asks customers to hand over production secrets. For that job, being the cheapest
option is a liability, not an advantage. Price is a trust signal: a credible premium price
says "we are an enterprise-grade custodian," while bargain pricing reads as "the cheap,
insecure option." insecur deliberately prices as a trusted production custodian.

The premium only lands if it is backed by visible substance. Pricing rides on top of the
security posture, it does not substitute for it. The things that justify the price and must be
marketed, not hidden in implementation:

- No-reveal custody: agents and ordinary human sessions have no read path to Protected
  Environment Sensitive Values.
- Small blast radius by design: tenant-bound data keys, key versions, ciphertext identity
  binding, no plaintext persistence on any durable surface.
- Tamper-evident audit export, approvals that an agent cannot clear, and short-lived
  machine credentials.
- Trust artifacts as they land: SOC 2, published penetration tests, the Storage Security Gate.

## Pricing axis: per human seat, never per robot

Charge **per human seat ($25/seat/month, with an annual discount)**. Do not meter automation.

- **Seats are humans.** The people who manage production secrets pay per seat. $25 matches Phase
  Enterprise and sits just above Doppler Team ($21), credibly premium without the Vault-style
  ~$1,150+/mo floor. An annual commitment earns a discount (target ~15-20% off, in line with
  competitors), giving a lower effective monthly rate in exchange for the commitment.
- **Machines are free and unlimited.** Machine identities, deploy keys, OIDC exchanges, runtime
  injections, and sync runs are never metered, at any tier.

This resolves the usual tension. Per-seat pricing is compatible with the agent/CI wedge because
agents and CI are not seats. "We charge for people, never for your robots" is a stronger and
more premium story than usage metering, and it avoids the competitor mistakes:

- Infisical meters per identity (machines count as seats), which penalizes automation.
- Pulumi ESC meters per API call, which penalizes read-heavy CI.

Predictable per-seat billing is itself a trust feature. Usage meters create bill anxiety, which
is off-brand for a product whose pitch is "trust us with production."

> Note: this revises the earlier draft of this doc, which proposed metering on Protected
> Environments. Protected Environments are now a paid-tier capability, not a billing meter.

## The free/paid line: dev is free, production custody is paid

insecur's own architecture draws the line. The build order splits **First Value**
(non-protected development Secret Use) from **Production Delivery** (Protected Environments,
provider sync, approvals, audit, OIDC), gated by the Storage Security Gate. That security
boundary is the paywall:

- **Free holds no production secrets.** The Free tier is non-protected development only. A solo
  dev or startup gets the full First Value loop, CLI, and runtime injection at zero cost, but
  the platform never custodies their valuable production secrets for free.
- **Production custody is a paid relationship.** Promoting a Protected Environment, connecting a
  provider for real sync, and enabling approval workflows require a paid plan.

This is both a trust posture and a liability posture. Free users are not trusting insecur with
production secrets, which limits blast radius, support burden, and abuse exposure, and it
reinforces the message that production-grade trust is something you pay for.

## Tiers

Three tiers: self-serve Free, self-serve Team, sales-led Enterprise. The self-serve Team tier
is the land-and-expand engine. Startups buy without a sales call and grow into Enterprise.

| | Free (Dev) | Team | Enterprise |
|---|---|---|---|
| Price | $0 | $25/seat/mo (humans), annual discount | Custom |
| Motion | Self-serve | Self-serve | Sales-led |
| Production custody (Protected Environments) | None (dev/non-protected only) | Yes | Yes |
| Organizations | 1 | 1 | Multiple |
| Projects | up to 3 | unlimited | unlimited |
| Non-protected dev environments | unlimited | unlimited | unlimited |
| Protected Environments | none | unlimited | unlimited |
| Provider connections (CF / Vercel / GitHub) | 1 | unlimited | unlimited |
| Members | up to 3 | per seat | per seat |
| Machine identities / deploy keys / OIDC / runtime injection / sync runs | unlimited | unlimited | unlimited |
| Approval workflows + risk presets | n/a (no protected envs) | all presets | all + future custom policy |
| Audit retention | 7 days | 90 days | custom |
| Tamper-evident audit export | – | yes | yes |
| SSO / SAML / SCIM | – | – | yes |
| Advanced audit access (longer retention, log streaming/SIEM, full-fidelity export) | – | standard | extended |
| Support / SLA | community | standard | dedicated + SLA |
| Compliance artifacts (SOC 2, pen test) | – | shared | shared + DPA/custom |

The shape is the point: free where value is proven (dev), premium per-seat where production
trust is delivered, sales-led where enterprise identity, governance, and compliance enter.

### What triggers the Team → Enterprise jump

Enterprise is the tier for organizations whose identity and governance requirements exceed
self-serve. The jump is gated on:

- **Enterprise identity:** SSO, SAML, and SCIM provisioning/deprovisioning.
- **Advanced audit access:** longer/custom retention, audit log streaming to SIEM, and
  full-fidelity security-review exports.
- **Governance and compliance:** DPA, custom contractual terms, dedicated support, and SLA.
- **Multi-org / scale:** more than one organization under one account and negotiated volume.

Team intentionally does not include SSO/SAML/SCIM. Identity federation is the clearest line
between a self-serve team and an enterprise buyer, and gating it there is standard practice.

## Why this structure over the alternatives

- **Free + Enterprise-only (no self-serve paid tier):** maximal white-glove feel but forces a
  sales conversation for every paying customer, killing the startup self-serve motion. Rejected.
- **No free tier (Team + Enterprise):** strongest "not the cheap guys" signal but loses the dev
  adoption funnel that feeds Team. Rejected; the Free dev tier carries no production-custody
  risk, so it is cheap insurance for the top of the funnel.
- **Usage metering (per protected env / per operation):** unpredictable, anxiety-inducing, and
  in the operation case it taxes the exact agent/CI behavior the product sells. Rejected.

## How this compares to competitors

| Product | Primary meter | Problem it creates |
|---|---|---|
| Doppler | Per seat ($8 / $21) | Reasonable; no production-vs-dev trust fence |
| Infisical | Per identity (users + machines) | Penalizes automation, opposite of agent-friendly |
| Phase | Per seat ($10 / $25) | Standard; no production value fence |
| 1Password | Per seat + rate-limited reads | Tight read caps throttle CI on low tiers |
| Pulumi ESC | Per secret + per API call | Punishes read-heavy CI and good secret hygiene |
| HCP Vault Dedicated | Cluster-hour + per-client | Expensive floor (~$1,150+/mo), not small-team friendly |
| AWS/GCP/Azure native | Per secret/version + per API call | Single-platform; metering compounds across platforms |
| **insecur (proposed)** | **Per human seat ($20); free dev tier; robots free** | **Premium and predictable; production custody is the paywall; automation never metered** |

The positioning: insecur charges a premium per-seat price for human access to production
custody, gives dev away free, and never bills the agent/CI loop. That is a different shape from
the seat-cheap generalists and the usage-metered infra tools, and it matches a premium trust
brand.

## Risks and mitigations

- **$20/seat with no track record can deter early adopters.** Mitigate with the free dev tier
  (real product experience at zero cost) and early-stage trust artifacts; do not discount the
  production tier to win logos, since that undercuts the premium signal.
- **Per-seat can discourage adding collaborators on small teams.** Mitigate by keeping machines
  free (most "users" of a secrets system are automated) and by a generous Free dev tier for
  evaluation. The buyer for paid is a company shipping production, for whom $20/seat is trivial.
- **Free tier abuse.** Free holds no production secrets, which bounds the blast radius. Public
  onboarding still requires the abuse controls, quotas, and Signup Lockdown in the architecture
  docs before broad signup.
- **Premium price must be backed by proof.** Prioritize SOC 2 and a published pen test on the
  roadmap; market the no-reveal and blast-radius story explicitly.

## Decided

- **Seat price: $25/seat/mo** for human seats, with an annual discount (target ~15-20% off).
- **Enterprise trigger:** SSO / SAML / SCIM, advanced audit access (longer retention, SIEM
  streaming, full-fidelity export), plus governance/compliance (DPA, dedicated support, SLA)
  and multi-org/volume.

## Open questions

- Exact annual discount percentage and whether to bill annual up front or monthly-with-commit.
- Whether Team needs a seat minimum or platform floor, or stays pure per-seat.
- Whether to surface a starting Enterprise price or keep it fully sales-led.
