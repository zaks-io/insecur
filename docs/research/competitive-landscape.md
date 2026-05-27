# Competitive Landscape

Last updated: 2026-05-25

Market analysis for insecur. Covers competing secrets-management products, how their
functionality compares to the insecur V1 product direction, published costs and limits,
and where insecur's wedge sits.

Scope reminder for insecur (from `docs/architecture.md` and `docs/project-status.md`):
a Cloudflare/Vercel/GitHub-Actions-native, multi-tenant secrets control plane for
Small-Group Production. The flagship V1 promise is **delivery-without-reveal**: let agents
and CI use production secrets for approved deploy and runtime workflows without giving local
agents or ordinary human sessions a read path to Protected Environment Sensitive Values.
Source of truth lives in insecur; provider secrets are derived delivery targets reached
through audited sync or just-in-time runtime injection.

The competitors split into two groups:

1. **Dedicated secrets platforms** that compete on the same job: Doppler, Infisical,
   Phase, EnvKey, HashiCorp Vault / HCP, Akeyless, 1Password, Pulumi ESC.
2. **Platform-native stores** that are the free baseline insecur sits on top of: AWS Secrets
   Manager, GCP Secret Manager, Azure Key Vault, Cloudflare Secrets Store, Vercel env vars,
   GitHub Actions secrets.

Detailed per-product profiles, with source URLs, live in:

- [competitors-dedicated.md](competitors-dedicated.md)
- [competitors-platform-native.md](competitors-platform-native.md)

---

## TL;DR wedge

No competitor combines all four of insecur's core bets:

1. **Native sync to all three of Cloudflare Workers + Vercel + GitHub Actions**, treating
   them as first-class derived targets rather than a generic "DIY" sync. Only Infisical and
   Phase cover all three natively; both are general-purpose, not stack-opinionated.
2. **Structural delivery-without-reveal as the default**, enforced at the storage and
   authorization layer (no reveal/readback/export/file-delivery path for Protected
   Environment values), not just a UI mask or an opt-in "sealed" secret type.
3. **Agent-and-CI-safe runtime injection** with per-run one-use Injection Grants,
   server-owned Runtime Injection Policies, OIDC for CI, and short-lived
   environment-scoped deploy keys, designed around the threat of a local agent.
4. **Policy-gated approval that cannot be cleared through an agent-reachable channel**
   for protected production, exposed as simple Strict/Balanced/Automation-Friendly presets
   rather than a custom policy editor or an Enterprise-only feature.

Each piece exists somewhere in the market. Nobody packages them for the
"small team shipping to Cloudflare/Vercel/GitHub with agents in the loop" buyer.

---

## Feature comparison vs insecur V1

Legend: Yes / No / Partial / N/A. "insecur V1" is the documented target, not current code.

| Capability                          | insecur V1       | Doppler                  | Infisical          | Phase                   | EnvKey               | Vault/HCP                   | Akeyless  | 1Password          | Pulumi ESC        |
| ----------------------------------- | ---------------- | ------------------------ | ------------------ | ----------------------- | -------------------- | --------------------------- | --------- | ------------------ | ----------------- |
| CF Workers native sync              | Yes (core)       | DIY/manual               | Yes                | Yes                     | No                   | No                          | No        | No                 | Via wrangler wrap |
| Vercel native sync                  | Yes (core)       | Yes                      | Yes                | Yes                     | No                   | Enterprise                  | No        | No                 | Via IaC           |
| GitHub Actions native sync          | Yes (core)       | Yes                      | Yes                | Yes                     | Via token            | Enterprise                  | Action    | Action             | Yes (OIDC)        |
| Runtime injection (`run -- cmd`)    | Yes              | Yes                      | Yes                | Yes                     | Sidecar              | Sidecar                     | CLI fetch | Yes (best DX)      | Yes               |
| OIDC for CI (no stored token)       | Yes (GH OIDC)    | Yes (GH)                 | Yes (multi)        | Partial                 | No                   | Yes                         | Yes       | No                 | Yes               |
| Short-lived machine creds           | Yes              | Partial                  | Yes                | Yes                     | Yes                  | Yes                         | Yes       | No (static token)  | Yes (OIDC)        |
| Delivery-without-reveal default     | Yes (enforced)   | Partial (Restricted, UI) | No (proxy preview) | Partial (Sealed opt-in) | No                   | No                          | No        | Partial (`op run`) | No                |
| No reveal path for protected vals   | Yes              | No                       | No                 | Partial                 | No                   | No                          | No        | No                 | No                |
| Approval not clearable by agent     | Yes              | Team+                    | Enterprise         | No                      | No                   | Enterprise (Control Groups) | JIT       | No                 | Enterprise        |
| Risk presets (Strict/Balanced/Auto) | Yes              | No                       | No                 | No                      | No                   | No                          | No        | No                 | No                |
| Multi-tenant orgs + RBAC            | Yes              | Yes                      | Yes                | Yes                     | Yes (Ent namespaces) | Yes                         | Yes       | Yes                | Yes               |
| Audit + versioning + rollback       | Yes              | Yes                      | Yes                | Yes                     | Yes                  | Yes                         | Yes       | Partial            | Yes               |
| Tamper-evident audit export         | Yes (hash chain) | No                       | No                 | No                      | No                   | No                          | No        | No                 | No                |
| Self-hosted option                  | No (hosted)      | No                       | Yes (MIT)          | Yes (OSS)               | Yes (OSS)            | Yes                         | Hybrid    | Connect proxy      | No                |
| Dynamic secrets engines             | Out of scope     | No                       | Yes                | No                      | No                   | Yes                         | Yes       | No                 | Yes               |

Read the "Out of scope" and "No" rows together: insecur is deliberately narrower than Vault,
Akeyless, and Pulumi ESC (no dynamic DB credential engines, no SCIM/LDAP/SAML/PAM/HSM, no
broad enterprise policy editor). The bet is depth on one stack and one custody model, not
breadth.

---

## Cost and limits snapshot

Dedicated platforms (entry paid tier, free tier shape):

| Product           | Free tier                                 | Paid entry                              | Pricing model               | Self-host           |
| ----------------- | ----------------------------------------- | --------------------------------------- | --------------------------- | ------------------- |
| Doppler           | 3 users, 10 projects, 3-day audit         | $8/user/mo (Dev), $21/user/mo (Team)    | Per seat                    | No                  |
| Infisical         | 5 identities, 3 projects, 10 integrations | $18/mo per identity                     | Per identity (user+machine) | Yes (MIT)           |
| Phase             | 5 users, 3 apps, 24h audit, 120 req/min   | $10/user/mo (Pro), $25/user/mo (Ent)    | Per seat                    | Yes (OSS)           |
| EnvKey            | Self-host only (cloud shut down Feb 2025) | N/A                                     | Was flat per-team           | Yes (MIT)           |
| HashiCorp Vault   | Community OSS self-host                   | HCP Dedicated ~$1,150+/mo small cluster | Cluster-hour + per-client   | Yes                 |
| HCP Vault Secrets | **Dead**: EOS Jun 2025, EOL Jul 2026      | N/A                                     | (was per-secret)            | N/A                 |
| Akeyless          | 500 static secrets, 5 clients             | Custom (not published)                  | Usage-based enterprise      | Hybrid only         |
| 1Password         | Bundled w/ plan                           | ~$8/user/mo Business                    | Per seat                    | Connect proxy only  |
| Pulumi ESC        | 25 secrets, 10k API calls/mo              | $0.50/secret/mo (Team), $0.75 (Ent)     | Per secret + per API call   | No (ESC cloud-only) |

Platform-native baseline (what insecur layers on top of, all single-platform):

| Store                    | Cost                                                                | Key limits                                                                |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| AWS Secrets Manager      | $0.40/secret/mo + $0.05/10k API calls                               | 64 KB/secret, 500k secrets/region                                         |
| GCP Secret Manager       | $0.06/active version/mo + $0.03/10k access; 6 versions+10k ops free | 64 KiB/version                                                            |
| Azure Key Vault          | No storage fee; $0.03/10k transactions                              | 25 KB/secret                                                              |
| Cloudflare Secrets Store | Free in open beta; paid pricing unpublished                         | **1 KB/secret, 100 secrets/account, 1 store/account**, still beta in 2026 |
| Vercel env vars          | Included                                                            | 64 KB total per deployment; "Sensitive" flag = write-only                 |
| GitHub Actions secrets   | Included                                                            | 48 KB/secret; 1,000 org / 100 repo / 100 env; not visible to Dependabot   |

Notes that matter for insecur:

- **Cloudflare Secrets Store is the weakest native store** (1 KB values, 100 secrets, one
  store per account, still beta, no published rotation/versioning). insecur targeting the
  Cloudflare stack means it competes against a thin, immature baseline there.
- **Per-seat is the dominant model** (Doppler, Phase, 1Password). Infisical's per-identity
  model charges for machine identities too, which penalizes automation-heavy small teams.
  Pulumi's per-secret + per-API-call model penalizes high-read CI workloads.
- **Vercel's April 2026 incident** (non-sensitive env vars leaked into build logs) is a live
  reminder that "encrypted at rest" is not "safe from accidental exposure." insecur's
  Misuse-Resistant Defaults and no-plaintext-output stance speak directly to this.

---

## Where each competitor is strong, and where insecur differs

**Doppler** — Best-known DX, polished sync to many platforms, Change Requests for approvals.
But Cloudflare Workers is DIY-only, "Restricted" visibility is UI/role enforcement not a
storage-layer guarantee, audit retention is stingy on lower tiers (3 days), SaaS-only.
insecur differs by making Cloudflare a first-class target and enforcing no-reveal structurally.

**Infisical** — Closest feature overlap: native CF Workers / Vercel / GitHub sync, OIDC,
machine identities, MIT self-host. insecur explicitly borrows its tenant shape (orgs >
projects > memberships). But Infisical secrets are plaintext-readable by anyone with
`secrets/read`; its "Agent Vault" credential proxy is a research preview, not the default.
insecur's no-reveal-by-default for protected values and agent-uncrossable approval are the
differentiators against the most similar product.

**Phase** — E2E encrypted, native sync to all three target platforms, and a "Sealed" secret
type that is genuinely write-once/no-reveal. This is the closest competitor to insecur's
reveal model. Differences: Sealed is an opt-in per-secret type rather than the default for
protected environments, Phase has no approval-workflow / protected-promotion model, and it
is general-purpose rather than agent-threat-oriented (no per-run injection grants, no
agent-uncrossable approval, no risk presets).

**EnvKey** — Cloud is dead (shut down Feb 2025); only self-host remains. Strong ZK crypto
and runtime injection but no native platform sync and no approval workflows. Mostly relevant
as a cautionary tale about flat-rate cloud economics, not a live competitor.

**HashiCorp Vault / HCP** — The enterprise standard, dynamic secrets, Control Groups for
multi-party reveal. But heavy to operate, no Cloudflare sync, Vercel/GitHub sync is
Enterprise-only, and HCP Vault Secrets (the lightweight SaaS that was the nearest analog) is
being killed by July 2026. insecur is deliberately not trying to be Vault; it competes on the
narrow stack and small-team operability Vault is bad at.

**Akeyless** — Vaultless DFC zero-knowledge, strong JIT approval, generous free tier. But no
push-sync to the target platforms (fetch model only), opaque enterprise pricing, hybrid-only
deployment. Enterprise-leaning; not aimed at the small-team Cloudflare/Vercel buyer.

**1Password** — Best `op run` injection DX and a huge existing install base. But no OIDC
workload identity (CI must store a static service-account token), no native sync to the
target platforms, no secret-level JIT approval, tight rate limits on lower tiers. Strong if
you already live in 1Password; weak on the agent/CI custody model.

**Pulumi ESC** — Best-in-class composition (aggregate from many upstream sources), first-class
OIDC, and the most complete approval model (Open Approvals + Update Approvals). But approvals
and audit are Enterprise-only, pricing is per-secret + per-API-call (punishes CI read
volume), it is IaC-centric, and reveal-on-approval still hands plaintext to the operator.
No structural no-reveal.

---

## The wedge, stated plainly

insecur should win the buyer who is: a small team or solo dev with multiple projects,
shipping to **Cloudflare + Vercel + GitHub Actions**, running **coding/deploy agents and CI**
that need to _use_ production secrets, who wants those secrets _used but not readable_ by the
agent or by a casual human session, without standing up Vault or paying enterprise prices for
an approval workflow.

Concretely, the defensible combination is:

1. **Stack-native sync depth** for CF Workers + Vercel + GitHub, including treating a
   Cloudflare Worker secret write as a production deploy in plan/approval/audit. Generalists
   either skip Cloudflare (Doppler DIY, Vault, Akeyless, 1Password) or treat all providers
   uniformly (Infisical, Phase).
2. **No-reveal as the default custody model for protected production**, enforced below the
   API, not an opt-in secret type (Phase Sealed) or a UI mask (Doppler Restricted) or a
   multi-party reveal gate that still ends in plaintext (Vault Control Groups, Pulumi Open
   Approvals).
3. **Agent-aware approval**: a Protected Environment production approval can never be cleared
   solely through an agent-reachable CLI/API channel, while non-protected dev/preview
   automation stays low-friction via opt-in. No competitor frames approval around the agent
   threat model; most gate approval behind Enterprise.
4. **Simple risk presets** (Strict / Balanced / Automation-Friendly) backed by versioned
   policy infra, instead of a custom policy editor (Vault/ESC) or no policy surface at all
   (Phase/EnvKey/1Password). This is a small-team-friendly packaging of a capability everyone
   else makes you either configure deeply or buy at Enterprise.

Risks to the wedge:

- **Infisical and Phase can close the gap** fastest: both already do tri-platform sync and
  one (Phase) has a credible no-reveal primitive. The moat is the agent-custody + approval
  framing and execution quality, not the feature checkboxes alone.
- **Cloudflare could mature Secrets Store** into something good enough that the Cloudflare
  half of the sync story matters less. Today its limits (1 KB, 100 secrets, beta) make that
  unlikely soon, but it is the platform owner.
- **insecur is hosted-only with no dynamic secrets and a narrow stack.** Teams wanting
  self-host (Infisical/Phase/Vault), dynamic DB credentials (Vault/Akeyless/ESC), or
  multi-cloud breadth are explicitly not the target and will pick others.
